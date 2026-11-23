// Minimal types for the build-time asset tools (scripts/assets). Not used by the site.

declare module "draco3dgltf" {
  const draco3d: {
    createDecoderModule(): Promise<unknown>;
    createEncoderModule(): Promise<unknown>;
  };
  export default draco3d;
}

declare module "gltf-validator" {
  interface ValidatorMessage {
    code: string;
    message: string;
    severity: number;
    pointer?: string;
  }
  interface ValidatorReport {
    validatorVersion: string;
    issues: { numErrors: number; numWarnings: number; messages: ValidatorMessage[] };
  }
  const validator: {
    validateBytes(data: Uint8Array, options?: { maxIssues?: number }): Promise<ValidatorReport>;
  };
  export default validator;
}
