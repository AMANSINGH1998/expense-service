import { DomainError } from "../../shared/result.js";

export type FactType = "number" | "string" | "boolean";

/**
 * The set of fact fields that rules are allowed to reference, with their
 * expected types. The application layer declares this catalog (it knows which
 * facts it can produce). Config validation rejects rules that reference an
 * unknown field, so a typo fails at configure time — never silently at
 * evaluation time.
 */
export class FieldCatalog {
  private readonly fields = new Map<string, FactType>();

  register(name: string, type: FactType): this {
    this.fields.set(name, type);
    return this;
  }

  has(name: string): boolean {
    return this.fields.has(name);
  }

  typeOf(name: string): FactType {
    const t = this.fields.get(name);
    if (!t) {
      throw new DomainError("FIELD_UNKNOWN", `Unknown fact field: ${name}`);
    }
    return t;
  }

  names(): string[] {
    return [...this.fields.keys()];
  }
}
