import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FEATURE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(FEATURE_DIR, "../../..");
const VIDEO_DIR = join(REPO_ROOT, "video");
const SOURCE_DIR = join(VIDEO_DIR, "src");
const OUTPUT_PATH = join(VIDEO_DIR, "out", "stock-ia-showcase.mp4");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory).flatMap((name) => {
    const filePath = join(directory, name);
    return statSync(filePath).isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

function readText(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readText(filePath)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function declaredDependencies(manifest: Record<string, unknown>): string[] {
  const dependencies = manifest.dependencies;
  const devDependencies = manifest.devDependencies;
  return [
    ...Object.keys(typeof dependencies === "object" && dependencies ? dependencies : {}),
    ...Object.keys(typeof devDependencies === "object" && devDependencies ? devDependencies : {}),
  ];
}

const sourceFiles = walkFiles(SOURCE_DIR).filter((filePath) =>
  SOURCE_EXTENSIONS.has(extname(filePath)),
);
const sourceText = sourceFiles.map(readText).join("\n");
const readme = readText(join(VIDEO_DIR, "README.md"));
const projectText = [sourceText, readme].join("\n");
const sequenceDeclarations = [...sourceText.matchAll(/<Sequence\b([\s\S]*?)>/g)].map(
  ([, attributes]) => attributes,
);
const sequenceNames = sequenceDeclarations.map(
  (attributes) => attributes.match(/\bname\s*=\s*["']([^"']+)["']/)?.[1] ?? "",
);

describe("Stock.ia Remotion showcase deliverable", () => {
  it("keeps Remotion isolated in a locally runnable video project", () => {
    const manifest = readJson(join(VIDEO_DIR, "package.json"));
    const rootManifest = readJson(join(REPO_ROOT, "package.json"));
    const rootLock = readJson(join(REPO_ROOT, "package-lock.json"));
    const manifestScripts = manifest.scripts as Record<string, string> | undefined;
    const lockPackages = rootLock.packages as Record<string, Record<string, unknown>> | undefined;
    const lockedRoot = lockPackages?.[""] ?? {};
    const videoLockfiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].filter(
      (name) => existsSync(join(VIDEO_DIR, name)),
    );

    expect(
      declaredDependencies(manifest).some(
        (name) => name === "remotion" || name.startsWith("@remotion/"),
      ),
    ).toBe(true);
    expect(videoLockfiles).toHaveLength(1);
    expect(manifestScripts).toEqual(
      expect.objectContaining({ studio: expect.any(String), render: expect.any(String) }),
    );
    expect(
      declaredDependencies(rootManifest).some(
        (name) => name === "remotion" || name.startsWith("@remotion/"),
      ),
    ).toBe(false);
    expect(
      declaredDependencies(lockedRoot).some(
        (name) => name === "remotion" || name.startsWith("@remotion/"),
      ),
    ).toBe(false);
  });

  it("registers a 1920x1080, 30 fps composition between 1500 and 1650 frames", () => {
    const compositionDefinition = sourceText.match(/<Composition\b[\s\S]*?>/)?.[0] ?? "";
    const duration = compositionDefinition.match(/durationInFrames\s*=\s*\{?\s*(\d+)/);

    expect(sourceText).toMatch(/<Composition\b/);
    expect(compositionDefinition).toMatch(/width\s*=\s*\{?\s*1920/);
    expect(compositionDefinition).toMatch(/height\s*=\s*\{?\s*1080/);
    expect(compositionDefinition).toMatch(/fps\s*=\s*\{?\s*30/);
    expect(duration).not.toBeNull();
    expect(Number(duration?.[1])).toBeGreaterThanOrEqual(1500);
    expect(Number(duration?.[1])).toBeLessThanOrEqual(1650);
    expect(readme).toMatch(/1620\s*frames|54\s*(?:segundos|seconds)|54\s*s\b/i);
  });

  it("contains exactly seven separately named scenes in the specified narrative order", () => {
    expect(sequenceDeclarations).toHaveLength(7);
    expect(sequenceNames).toEqual([
      expect.stringMatching(/marca/i),
      expect.stringMatching(/venta|mostrador/i),
      expect.stringMatching(/cat[aá]logo/i),
      expect.stringMatching(/inventario/i),
      expect.stringMatching(/cuenta\s*corriente/i),
      expect.stringMatching(/operaci[oó]n/i),
      expect.stringMatching(/cierre/i),
    ]);
  });

  it("exports the MP4 to the agreed location with an MP4 container signature", () => {
    expect(existsSync(OUTPUT_PATH)).toBe(true);
    if (existsSync(OUTPUT_PATH)) {
      const mp4 = readFileSync(OUTPUT_PATH);
      expect(mp4.length).toBeGreaterThan(12);
      expect(mp4.toString("ascii", 4, 8)).toBe("ftyp");
    }
    expect(readme).toMatch(/H\.264|H264/i);
    expect(readme).toMatch(/video\/out\/stock-ia-showcase\.mp4/);
  });

  it("shows a Spanish sales flow with context, product table, and session or cash context", () => {
    expect(sourceText).toMatch(/venta\s+(?:en\s+)?mostrador|registrar\s+una\s+venta/i);
    expect(sourceText).toMatch(/productos|art[ií]culos/i);
    expect(sourceText).toMatch(/ses[ií][oó]n|caja/i);
    expect(sourceText).toMatch(/total|importe/i);
  });

  it("presents the public catalog with search, categories, product cards, and a cart", () => {
    expect(sourceText).toMatch(/cat[aá]logo\s+(?:digital\s+)?p[uú]blico|cat[aá]logo\s+digital/i);
    expect(sourceText).toMatch(/buscar|b[uú]squeda|busc[aá]/i);
    expect(sourceText).toMatch(/categor[ií]as?|filtros?/i);
    expect(sourceText).toMatch(/tarjetas?\s+(?:de\s+)?productos?|product\s*cards?/i);
    expect(sourceText).toMatch(/carrito/i);
  });

  it("represents inventory filters, product stock, and Cuenta Corriente list and detail", () => {
    expect(sourceText).toMatch(/inventario|stock/i);
    expect(sourceText).toMatch(/filtros?|categor[ií]as?/i);
    expect(sourceText).toMatch(/existencias|stock|unidades/i);
    expect(sourceText).toMatch(/cuenta\s*corriente/i);
    expect(sourceText).toMatch(/b[uú]squeda|buscar|cliente/i);
    expect(sourceText).toMatch(/estado|pendiente|pagad[oa]s?/i);
    expect(sourceText).toMatch(/saldo|importe\s+pendiente/i);
    expect(sourceText).toMatch(/historial\s+(?:de\s+)?pagos|movimientos\s+(?:de\s+)?pagos/i);
  });

  it("covers customers, cash register, and reports as the operations scene", () => {
    expect(sourceText).toMatch(/clientes|clientas/i);
    expect(sourceText).toMatch(/caja|caja\s+registradora|movimientos\s+de\s+efectivo/i);
    expect(sourceText).toMatch(/reportes|informes/i);
  });

  it("does not invent controls that are absent from the reviewed source screens", () => {
    expect(sourceText).not.toMatch(/ordenar\s*:\s*destacados/i);
    expect(sourceText).not.toMatch(/nueva\s+cuenta/i);
    expect(sourceText).not.toMatch(/filtrar\s+por\s+categor[ií]a/i);
    expect(sourceText).not.toMatch(/[uú]ltimos\s+7\s+d[ií]as/i);
  });

  it("uses the correctly accented Spanish label Selección múltiple", () => {
    expect(sourceText).toContain("Selección múltiple");
  });

  it("uses concise Spanish copy and keeps the story understandable without audio", () => {
    expect(sourceText).toMatch(/Stock\.ia/i);
    expect(sourceText).toMatch(/punto de venta|POS/i);
    expect(sourceText).toMatch(/inventario/i);
    expect(readme).toMatch(/silencioso|sin audio|silenciosa|silent|silence/i);
  });

  it("documents synthetic records and has no live data, network, or POS dependencies", () => {
    expect(projectText).toMatch(
      /(datos|registros|contenido).{0,60}(ficticios|sint[eé]ticos|de ejemplo)|(ficticios|sint[eé]ticos|de ejemplo).{0,60}(datos|registros|contenido)/i,
    );
    expect(sourceText).not.toMatch(/https?:\/\//i);
    expect(sourceText).not.toMatch(/\b(fetch\s*\(|process\.env|DATABASE_URL|PrismaClient)\b/i);
    expect(sourceText).not.toMatch(/@prisma\/|from\s+["'][^"']*(?:firebase|@\/actions|@\/lib\/db)/i);
    expect(projectText).not.toMatch(
      /(l[ií]der(?:es)? del mercado|n[uú]mero uno|100\s*%\s*autom[aá]tico|garantizado|testimonio real)/i,
    );
    expect(readme).toMatch(
      /((sin|no requiere|does not require|without|no need for).{0,60}(base de datos|database|\.env|internet|network|red)|(base de datos|database|\.env|internet|network|red).{0,60}(not required|no se requiere|not needed))/i,
    );
  });

  it("is source-editable, deterministic, locally previewable, and silent", () => {
    const rootManifest = readJson(join(REPO_ROOT, "package.json"));
    const hasAudio = /<Audio\b|staticFile\([^)]*\.(mp3|wav|aac|m4a|ogg)/i.test(sourceText);

    expect(sourceFiles.length).toBeGreaterThanOrEqual(2);
    expect(sourceText).toMatch(/useCurrentFrame|interpolate\s*\(/);
    expect(readme).toMatch(/Remotion Studio/i);
    expect(readme).toMatch(/npm run render/i);
    expect(readme).toMatch(/video\/out\/stock-ia-showcase\.mp4/);
    expect(readme).toMatch(/ficticios|sint[eé]ticos|de ejemplo|fictitious|synthetic|sample/i);
    expect(readme).toMatch(/silencioso|sin audio|silenciosa|silent|silence/i);
    expect(hasAudio).toBe(false);
    expect(
      declaredDependencies(rootManifest).some(
        (name) => name === "remotion" || name.startsWith("@remotion/"),
      ),
    ).toBe(false);
  });
});
