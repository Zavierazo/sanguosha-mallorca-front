declare module "saxen" {
  export type AttributeGetter = () => Record<string, string>;
  export type EntityDecoder = (value: string) => string;
  export type ContextGetter = () => unknown;

  export class Parser {
    constructor(options?: { proxy?: boolean });
    on(
      event: "openTag",
      listener: (
        name: string,
        getAttributes: AttributeGetter,
        decodeEntities: EntityDecoder,
        selfClosing: boolean,
        getContext: ContextGetter
      ) => void
    ): this;
    on(
      event: "closeTag",
      listener: (
        name: string,
        decodeEntities: EntityDecoder,
        selfClosing: boolean,
        getContext: ContextGetter
      ) => void
    ): this;
    on(
      event: "text",
      listener: (
        value: string,
        decodeEntities: EntityDecoder,
        getContext: ContextGetter
      ) => void
    ): this;
    parse(xml: string): void;
  }
}
