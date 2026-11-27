// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const retiredVideoDirectory = resolve(repositoryRoot, "video");
const retiredShowcaseFeature = resolve(
  repositoryRoot,
  "ai/features/remotion-showcase-video",
);

interface RootManifest {
  name: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface RootLockfile {
  name: string;
  packages: Record<
    string,
    {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }
  >;
}

const readJson = <T,>(relativePath: string): T =>
  JSON.parse(
    readFileSync(resolve(repositoryRoot, relativePath), "utf8"),
  ) as T;

const remotionPackageNames = (packageNames: string[]) =>
  packageNames.filter(
    (name) => /(?:^|\/)(?:remotion|@remotion\/[^/]+)$/.test(name),
  );

describe("remove-video-directory static acceptance checks", () => {
  it("removes only the exact root video directory", () => {
    expect(existsSync(retiredVideoDirectory)).toBe(false);
  });

  it("removes the dedicated Remotion showcase feature directory", () => {
    expect(existsSync(retiredShowcaseFeature)).toBe(false);
  });

  it("preserves the POS root manifest and keeps its scripts and dependencies Remotion-free", () => {
    const manifest = readJson<RootManifest>("package.json");
    const dependencyNames = [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
    ];

    expect(manifest.name).toBe("pos-template");
    expect(manifest.scripts.build).toBe("next build");
    expect(manifest.scripts.lint).toBe("eslint src/");
    expect(remotionPackageNames(dependencyNames)).toEqual([]);
  });

  it("preserves the POS root lockfile without Remotion dependencies", () => {
    const manifest = readJson<RootManifest>("package.json");
    const lockfile = readJson<RootLockfile>("package-lock.json");
    const rootPackage = lockfile.packages[""];
    const lockPackageNames = Object.keys(lockfile.packages);
    const rootDependencyNames = [
      ...Object.keys(rootPackage.dependencies ?? {}),
      ...Object.keys(rootPackage.devDependencies ?? {}),
    ];

    expect(lockfile.name).toBe("pos-template");
    expect(rootPackage.name).toBe(manifest.name);
    expect(rootPackage.dependencies).toEqual(manifest.dependencies);
    expect(rootPackage.devDependencies).toEqual(manifest.devDependencies);
    expect(remotionPackageNames(rootDependencyNames)).toEqual([]);
    expect(remotionPackageNames(lockPackageNames)).toEqual([]);
  });

  it("preserves the POS TypeScript and Next.js configuration without video-specific workarounds", () => {
    const tsconfig = readJson<{
      include: string[];
      exclude: string[];
    }>("tsconfig.json");
    const nextConfig = readFileSync(
      resolve(repositoryRoot, "next.config.ts"),
      "utf8",
    );

    expect(tsconfig.include).toContain("**/*.ts");
    expect(tsconfig.include).toContain("**/*.tsx");
    // El proyecto excluye tests/scripts/IA de su typecheck de producción, pero
    // no debe conservar workarounds específicos del video retirado.
    expect(tsconfig.exclude).toContain("node_modules");
    expect(tsconfig.exclude).not.toContain("video");
    expect(nextConfig).not.toMatch(/remotion|(?:^|[/\\])video(?:[/\\]|["'])/i);
  });
});
