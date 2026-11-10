// Check that the web build removes old
// distribution files. Run npm run tecos
// before this test.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT } from "./lib/root.mjs";
import { problems } from "../tools/tecos.mjs";

test("the web build starts clean: a file left in dist from an older build doesn't reach the page", { timeout: 300_000 }, () => {
  mkdirSync(resolve(ROOT, "dist/files"), { recursive: true });
  writeFileSync(resolve(ROOT, "dist/files/EDIT.COM"), Uint8Array.from([0xc9]));
  execFileSync(process.execPath, ["tools/build.mjs"], { cwd: ROOT, stdio: "ignore" });
  assert.deepEqual(readdirSync(resolve(ROOT, "dist/files")).sort(), readdirSync(resolve(ROOT, "tec-os/dist/files")).sort());
});

test("the firmware precheck verifies the page recipe", { concurrency: false }, async (t) => {
  const path = resolve(ROOT, "tec-os/dist/page.recipe.json");
  const original = readFileSync(path);
  const valid = JSON.parse(original);
  const sample = (recipe) => recipe.components.flatMap((component) => component.files)
    .find((file) => file.name === "SAMPLE.ASM");
  sample(valid).bytes = 4485;
  sample(valid).sha256 = "1bfd9696548327f5717f18b749ec2bcb3468df2e6c1dbea095b295673a00c20e";
  const cases = [
    ["stale length", (recipe) => { sample(recipe).bytes = 5051; }, /SAMPLE\.ASM has 4485 bytes, recipe says 5051/],
    ["wrong hash", (recipe) => { sample(recipe).sha256 = "0".repeat(64); }, /SAMPLE\.ASM recipe SHA-256/],
    ["duplicate name", (recipe) => { recipe.components[0].files.push({ ...sample(recipe) }); }, /declared more than once/],
    ["missing name", (recipe) => { recipe.components.find((component) => component.files.includes(sample(recipe))).files = []; }, /SAMPLE\.ASM is missing from the recipe/],
    ["extra name", (recipe) => { recipe.components[0].files.push({ ...sample(recipe), name: "EXTRA.COM" }); }, /EXTRA\.COM is not named in pins/],
    ["wrong URL", (recipe) => { sample(recipe).url = "../SAMPLE.ASM"; }, /SAMPLE\.ASM URL must be files\/SAMPLE\.ASM/],
    ["wrong drive", (recipe) => { sample(recipe).drive = "B"; }, /SAMPLE\.ASM must be placed on drive A in user 0/],
    ["wrong user", (recipe) => { sample(recipe).user = 1; }, /SAMPLE\.ASM must be placed on drive A in user 0/],
    ["wrong schema", (recipe) => { recipe.schema = "unknown"; }, /unsupported schema/],
    ["wrong profile", (recipe) => { recipe.profile = "other"; }, /profile must be tecos/],
    ["missing components", (recipe) => { delete recipe.components; }, /components must be an array/],
    ["invalid file list", (recipe) => { recipe.components[0].files = null; }, /component files must be an array/],
    ["invalid file", (recipe) => { recipe.components[0].files[0] = null; }, /file declarations must have a name/],
    ["missing A volume", (recipe) => { recipe.volumes = []; }, /one writable G1M volume mounted at A/],
    ["duplicate A volume", (recipe) => { recipe.volumes.push({ ...recipe.volumes[0] }); }, /one writable G1M volume mounted at A/],
    ["read-only A volume", (recipe) => { recipe.volumes[0].readOnly = true; }, /one writable G1M volume mounted at A/],
    ["numeric read-only A volume", (recipe) => { recipe.volumes[0].readOnly = 1; }, /one writable G1M volume mounted at A/],
    ["string read-only A volume", (recipe) => { recipe.volumes[0].readOnly = "true"; }, /one writable G1M volume mounted at A/],
    ["duplicate lowercase A mount", (recipe) => { recipe.volumes[1].mount = "a"; }, /one writable G1M volume mounted at A/],
    ["duplicate colon A mount", (recipe) => { recipe.volumes[1].mount = "A:"; }, /one writable G1M volume mounted at A/],
    ["wrong A geometry", (recipe) => { recipe.volumes[0].geometry = "G8M"; }, /one writable G1M volume mounted at A/],
    // Fields the structural checks don't read are pinned through the canonical digest.
    ["changed B geometry", (recipe) => { recipe.volumes[1].geometry = "G1M"; }, /canonical SHA-256 is [0-9a-f]{64}, not the pinned/],
    ["B write-behind off", (recipe) => { recipe.volumes[1].writeBehind = false; }, /canonical SHA-256 is [0-9a-f]{64}, not the pinned/],
    ["extra volume", (recipe) => { recipe.volumes.push({ geometry: "G1M", label: "EXTRA", mount: "C" }); }, /canonical SHA-256 is [0-9a-f]{64}, not the pinned/],
    ["empty component", (recipe) => { recipe.components.push({ id: "empty", name: "EMPTY", files: [] }); }, /canonical SHA-256 is [0-9a-f]{64}, not the pinned/],
    ["extra file field", (recipe) => { sample(recipe).readOnly = true; }, /canonical SHA-256 is [0-9a-f]{64}, not the pinned/],
    ["changed instruction", (recipe) => { recipe.instruction = "changed"; }, /canonical SHA-256 is [0-9a-f]{64}, not the pinned/],
  ];
  try {
    await t.test("matching recipe", () => {
      writeFileSync(path, JSON.stringify(valid));
      assert.deepEqual(problems(), []);
    });
    for (const mount of ["a", "A:"]) {
      await t.test(`matching A volume spelled ${mount}`, () => {
        const recipe = structuredClone(valid);
        recipe.volumes[0].mount = mount;
        writeFileSync(path, JSON.stringify(recipe));
        assert.deepEqual(problems(), []);
      });
    }
    for (const [name, change, diagnostic] of cases) {
      await t.test(name, () => {
        const recipe = structuredClone(valid);
        change(recipe);
        writeFileSync(path, JSON.stringify(recipe));
        assert.match(problems().join("\n"), diagnostic);
      });
    }
    await t.test("missing recipe", () => {
      unlinkSync(path);
      assert.match(problems().join("\n"), /page\.recipe\.json is missing/);
    });
    await t.test("malformed recipe", () => {
      writeFileSync(path, "{");
      assert.match(problems().join("\n"), /cannot be read as JSON/);
    });
    await t.test("non-object recipe", () => {
      writeFileSync(path, "null");
      assert.match(problems().join("\n"), /must be an object/);
    });
  } finally {
    writeFileSync(path, original);
  }
});
