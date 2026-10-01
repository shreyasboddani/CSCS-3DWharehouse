import { z } from "zod";
import { configSchema } from "./warehouse";
import { designSchema, floorSchema, moduleSchema } from "./design";
const draftDesign = designSchema.extend({
  floors: z
    .array(
      floorSchema.extend({
        name: z.string().max(80),
        modules: z
          .array(moduleSchema.extend({ label: z.string().max(80) }))
          .max(400),
      }),
    )
    .min(1)
    .max(4),
});
export const draftInputSchema = z.object({
  config: configSchema.extend({
    name: z.string().max(80),
    design: draftDesign.optional(),
  }),
  warehouseId: z.string().uuid().optional(),
  context: z
    .object({
      mode: z.enum(["template", "studio"]).default("studio"),
      floorId: z.string().max(32).optional(),
      outlinePoints: z
        .array(
          z.object({
            x: z.number().min(-70).max(70),
            z: z.number().min(-70).max(70),
          }),
        )
        .max(32)
        .optional(),
    })
    .default({ mode: "studio" }),
  version: z.number().int().min(1).optional(),
});
export type DraftInput = z.infer<typeof draftInputSchema>;
export type DesignDraft = Omit<DraftInput, "version"> & {
  id: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  completed: boolean;
};
