import { responseSchema } from "./prompt";

// zodResponseFormat converts the zod schema to OpenAI's strict JSON Schema
// when prompt.ts is loaded and throws if the openai helper rejects what the
// installed zod emits — which crashes the bot at startup. Importing the module
// above is the actual check; the assertions pin the shape we send to the API.
describe("responseSchema", () => {
  it("builds a strict JSON schema for the AI response", () => {
    const { json_schema } = responseSchema;

    expect(json_schema.name).toBe("responseSchema");
    expect(json_schema.strict).toBe(true);
    expect((json_schema.schema as any).properties.result.anyOf).toHaveLength(7);
  });
});
