import { TaggedError } from 'effect/Data';

export class ResourceError extends TaggedError('ResourceError')<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class ResourceNotFoundError extends TaggedError('ResourceNotFoundError')<{
	readonly name: string;
	readonly availableResources: string[];
}> {}

export class ResourceNotCachedError extends TaggedError('ResourceNotCachedError')<{
	readonly name: string;
}> {}

export class InvalidResourcePathError extends TaggedError('InvalidResourcePathError')<{
	readonly name: string;
	readonly path: string;
}> {}
