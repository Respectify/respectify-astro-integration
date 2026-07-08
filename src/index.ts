import type { AstroIntegration } from "astro";

export interface RespectifyIntegrationOptions {
  /**
   * Optional public key that client code can reference.
   */
  publicKey?: string;
  /**
   * Default moderation mode.
   */
  mode?: "perspective-compatible" | "full-moderation";
}

export default function respectify(
  options: RespectifyIntegrationOptions = {}
): AstroIntegration {
  return {
    name: "@respectify/astro",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            define: {
              __RESPECTIFY_MODE__: JSON.stringify(
                options.mode ?? "perspective-compatible"
              ),
              __RESPECTIFY_PUBLIC_KEY__: JSON.stringify(options.publicKey ?? "")
            }
          }
        });
      }
    }
  };
}
