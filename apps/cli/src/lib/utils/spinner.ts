import { Duration, Effect, Fiber } from 'effect';

export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

export type SpinnerHandle = {
	stop: (finalMessage?: string) => Effect.Effect<void>;
};

const isInteractiveTerminal = () => {
	if (typeof process === 'undefined' || typeof process.stdout === 'undefined') {
		return false;
	}

	if (typeof process.stdout.isTTY === 'boolean') {
		return process.stdout.isTTY;
	}

	return true;
};

export const startSpinner = (label: string): Effect.Effect<SpinnerHandle> =>
	Effect.gen(function* () {
		if (!isInteractiveTerminal()) {
			return {
				stop: (finalMessage?: string) =>
					finalMessage ? Effect.sync(() => console.log(finalMessage)) : Effect.void
			};
		}

		let idx = 0;
		let lastRenderLength = 0;
		let stopped = false;

		process.stdout.write('\n');

		const renderFrame = Effect.sync(() => {
			const frame = spinnerFrames[idx % spinnerFrames.length];
			idx += 1;
			const text = `${frame} ${label}`;
			const padding =
				lastRenderLength > text.length ? ' '.repeat(lastRenderLength - text.length) : '';
			process.stdout.write(`\r${text}${padding}`);
			lastRenderLength = text.length;
		});

		const spinnerFiber = yield* renderFrame.pipe(
			Effect.zipRight(
				Effect.forever(Effect.sleep(Duration.millis(80)).pipe(Effect.zipRight(renderFrame)))
			),
			Effect.forkDaemon
		);

		const stop = (finalMessage?: string) =>
			Effect.uninterruptible(
				Effect.gen(function* () {
					if (stopped) {
						return;
					}
					stopped = true;
					yield* Fiber.interrupt(spinnerFiber);
					process.stdout.write(`\r${' '.repeat(lastRenderLength)}\r`);
					if (finalMessage) {
						process.stdout.write(`${finalMessage}\n`);
					}
				})
			);

		return { stop };
	});
