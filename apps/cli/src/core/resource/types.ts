import { Schema } from 'effect';

// Base fields shared by all resource types
const BaseResourceFields = {
	name: Schema.String,
	specialNotes: Schema.optional(Schema.String)
};

// Git resource - cloned from a remote repository
export const GitResourceSchema = Schema.Struct({
	...BaseResourceFields,
	type: Schema.Literal('git'),
	url: Schema.String,
	branch: Schema.String,
	searchPath: Schema.optional(Schema.String) // subdirectory to focus on
});

// Local resource - symlink to an existing local directory
export const LocalResourceSchema = Schema.Struct({
	...BaseResourceFields,
	type: Schema.Literal('local'),
	path: Schema.String // absolute path to local directory
});

// Discriminated union of all resource types
export const ResourceDefinitionSchema = Schema.Union(GitResourceSchema, LocalResourceSchema);

// Type exports
export type GitResource = typeof GitResourceSchema.Type;
export type LocalResource = typeof LocalResourceSchema.Type;
export type ResourceDefinition = typeof ResourceDefinitionSchema.Type;

// Runtime type guards
export const isGitResource = (r: ResourceDefinition): r is GitResource => r.type === 'git';
export const isLocalResource = (r: ResourceDefinition): r is LocalResource => r.type === 'local';

// Resource info returned after ensuring a resource is cached
export interface ResourceInfo {
	name: string;
	type: ResourceDefinition['type'];
	path: string; // absolute path to cached resource
	specialNotes?: string;
}
