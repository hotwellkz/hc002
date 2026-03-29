import Ajv, { type ErrorObject, type AnySchema } from "ajv";

import { projectToWire } from "../io/projectWire";
import type { Project } from "../domain/project";

import projectSchemaV1 from "./project-schema-v1.json";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateCompiled = ajv.compile(projectSchemaV1 as AnySchema);

export interface ProjectSchemaValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ErrorObject[] | undefined;
}

/** Валидация сериализуемого вида (wire v0), соответствующего JSON Schema. */
export function validateProjectSchema(project: Project): ProjectSchemaValidationResult {
  const wire = projectToWire(project);
  const ok = validateCompiled(wire) as boolean;
  return { ok, errors: validateCompiled.errors ?? undefined };
}

export function validateProjectWireJson(data: unknown): ProjectSchemaValidationResult {
  const ok = validateCompiled(data) as boolean;
  return { ok, errors: validateCompiled.errors ?? undefined };
}
