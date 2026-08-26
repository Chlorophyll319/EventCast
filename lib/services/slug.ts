import { nanoid } from "nanoid";
import { prisma } from "../prisma";

const SLUG_LENGTH = 8;
const MAX_ATTEMPTS = 5;

export class SlugGenerationError extends Error {}

export async function generateUniquePageSlug(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = nanoid(SLUG_LENGTH);
    const existing = await prisma.page.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new SlugGenerationError(`Failed to generate a unique slug after ${MAX_ATTEMPTS} attempts.`);
}
