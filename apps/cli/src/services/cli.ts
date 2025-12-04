import { Command, Options } from "@effect/cli";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer, Schema, Stream } from "effect";
import { OcService, type OcEvent } from "./oc.ts";

declare const __VERSION__: string;
const VERSION: string =
  typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev";

const programLayer = Layer.mergeAll(OcService.Default);

// === Ask Subcommand ===
const questionOption = Options.text("question").pipe(Options.withAlias("q"));
const techOption = Options.text("tech").pipe(Options.withAlias("t"));

const askCommand = Command.make(
  "ask",
  { question: questionOption, tech: techOption },
  ({ question, tech }) =>
    Effect.gen(function* () {
      const oc = yield* OcService;
      const eventStream = yield* oc.askQuestion({ tech, question });

      let currentMessageId: string | null = null;

      yield* eventStream.pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            switch (event.type) {
              case "message.part.updated":
                if (event.properties.part.type === "text") {
                  if (currentMessageId === event.properties.part.messageID) {
                    process.stdout.write(event.properties.delta ?? "");
                  } else {
                    currentMessageId = event.properties.part.messageID;
                    process.stdout.write("\n\n" + event.properties.part.text);
                  }
                }
                break;
              default:
                break;
            }
          })
        )
      );

      console.log("\n");
    }).pipe(
      Effect.catchTags({
        InvalidProviderError: (e) =>
          Effect.sync(() => {
            console.error(`Error: Unknown provider "${e.providerId}"`);
            console.error(`Available providers: ${e.availableProviders.join(", ")}`);
            process.exit(1);
          }),
        InvalidModelError: (e) =>
          Effect.sync(() => {
            console.error(`Error: Unknown model "${e.modelId}" for provider "${e.providerId}"`);
            console.error(`Available models: ${e.availableModels.join(", ")}`);
            process.exit(1);
          }),
        ProviderNotConnectedError: (e) =>
          Effect.sync(() => {
            console.error(`Error: Provider "${e.providerId}" is not connected`);
            console.error(`Connected providers: ${e.connectedProviders.join(", ")}`);
            console.error(`Run "opencode auth" to configure provider credentials.`);
            process.exit(1);
          }),
      }),
      Effect.provide(programLayer)
    )
);

// === Open Subcommand ===
const openCommand = Command.make("open", {}, () =>
  Effect.gen(function* () {
    const oc = yield* OcService;
    yield* oc.holdOpenInstanceInBg();
  }).pipe(Effect.provide(programLayer))
);

// === Chat Subcommand ===
const chatTechOption = Options.text("tech").pipe(Options.withAlias("t"));

const chatCommand = Command.make("chat", { tech: chatTechOption }, ({ tech }) =>
  Effect.gen(function* () {
    const oc = yield* OcService;
    yield* oc.spawnTui({ tech });
  }).pipe(Effect.provide(programLayer))
);

// === Serve Subcommand ===
const QuestionRequest = Schema.Struct({
  tech: Schema.String,
  question: Schema.String,
});

const portOption = Options.integer("port").pipe(
  Options.withAlias("p"),
  Options.withDefault(8080)
);

const serveCommand = Command.make("serve", { port: portOption }, ({ port }) =>
  Effect.gen(function* () {
    const router = HttpRouter.empty.pipe(
      HttpRouter.post(
        "/question",
        Effect.gen(function* () {
          const body = yield* HttpServerRequest.schemaBodyJson(QuestionRequest);
          const oc = yield* OcService;

          const eventStream = yield* oc.askQuestion({
            tech: body.tech,
            question: body.question,
          });

          const chunks: string[] = [];
          let currentMessageId: string | null = null;
          yield* eventStream.pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                switch (event.type) {
                  case "message.part.updated":
                    if (event.properties.part.type === "text") {
                      if (
                        currentMessageId === event.properties.part.messageID
                      ) {
                        chunks[chunks.length - 1] +=
                          event.properties.delta ?? "";
                      } else {
                        currentMessageId = event.properties.part.messageID;
                        chunks.push(event.properties.part.text ?? "");
                      }
                    }
                    break;
                  default:
                    break;
                }
              })
            )
          );

          return yield* HttpServerResponse.json({ answer: chunks.join("") });
        })
      )
    );

    const ServerLive = BunHttpServer.layer({ port });

    const HttpLive = router.pipe(
      HttpServer.serve(),
      HttpServer.withLogAddress,
      Layer.provide(ServerLive)
    );

    return yield* Layer.launch(HttpLive);
  }).pipe(Effect.scoped, Effect.provide(programLayer))
);

// === Main Command ===
const mainCommand = Command.make("btca", {}, () =>
  Effect.sync(() => {
    console.log(`btca v${VERSION}. run btca --help for more information.`);
  })
).pipe(
  Command.withSubcommands([askCommand, serveCommand, openCommand, chatCommand])
);

const cliService = Effect.gen(function* () {
  return {
    run: (argv: string[]) =>
      Command.run(mainCommand, {
        name: "btca",
        version: VERSION,
      })(argv),
  };
});

export class CliService extends Effect.Service<CliService>()("CliService", {
  effect: cliService,
}) {}

export { type OcEvent };
