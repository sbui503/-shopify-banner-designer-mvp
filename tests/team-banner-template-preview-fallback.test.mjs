import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const designerSource = readFileSync(new URL("../public/team-banner-designer.js", import.meta.url), "utf8");

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in the designer bundle`);

  const openBrace = source.indexOf("{", start);
  assert.notEqual(openBrace, -1, `${name} should have a function body`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  assert.fail(`${name} function body should close`);
}

function createFallbackHarness() {
  const generatedProductPreviewUrl = extractNamedFunction(designerSource, "generatedProductPreviewUrl");
  const markTemplateImageBroken = extractNamedFunction(designerSource, "markTemplateImageBroken");
  const templateDesignImage = extractNamedFunction(designerSource, "templateDesignImage");

  return Function(`
    let selectedTemplate = null;
    function resolveSourceUrl(value) {
      return \`resolved:\${value}\`;
    }
    ${generatedProductPreviewUrl}
    ${markTemplateImageBroken}
    ${templateDesignImage}
    return {
      generatedProductPreviewUrl,
      markTemplateImageBroken,
      templateDesignImage,
      selectedTemplate() {
        return selectedTemplate;
      },
      setSelectedTemplate(template) {
        selectedTemplate = template;
      }
    };
  `)();
}

test("product preview fallback prefers explicit SVG sources before generated handle SVGs", () => {
  const helpers = createFallbackHarness();

  assert.equal(
    helpers.generatedProductPreviewUrl({ templateSvg: "/templates/custom.svg" }, "ignored-handle"),
    "resolved:/templates/custom.svg"
  );
  assert.equal(
    helpers.generatedProductPreviewUrl({ layerConfig: { layoutSvgUrl: "/layouts/url.svg" } }, "ignored-handle"),
    "resolved:/layouts/url.svg"
  );
  assert.equal(
    helpers.generatedProductPreviewUrl({ layerConfig: { layoutSvg: "/layouts/raw.svg" } }, "ignored-handle"),
    "resolved:/layouts/raw.svg"
  );
  assert.equal(
    helpers.generatedProductPreviewUrl({ title: "No SVG" }, "soccer-banner"),
    "resolved:/generated-product-svgs/soccer-banner.svg"
  );
  assert.equal(helpers.generatedProductPreviewUrl({ title: "No SVG" }, ""), "");
});

test("broken template previews switch cards, selected preview, and design launch image to the fallback", () => {
  const helpers = createFallbackHarness();
  const template = {
    key: "soccer-template",
    image: "https://cdn.shopify.com/missing.jpg",
    fallbackImage: "resolved:/generated-product-svgs/soccer-template.svg",
    imageBroken: false
  };
  const selectedTemplate = { ...template };
  const image = { src: template.image };

  helpers.setSelectedTemplate(selectedTemplate);

  assert.equal(helpers.templateDesignImage(template), template.image);
  assert.equal(helpers.markTemplateImageBroken(template, image), true);
  assert.equal(template.imageBroken, true);
  assert.equal(image.src, template.fallbackImage);
  assert.equal(helpers.selectedTemplate().imageBroken, true);
  assert.equal(helpers.templateDesignImage(template), template.fallbackImage);

  assert.equal(helpers.markTemplateImageBroken(template, image), false);
});

test("template UI wiring routes image failures and design launches through the fallback helper", () => {
  assert.match(
    designerSource,
    /els\.templatePreviewImage\.onerror = \(\) => \{\s*els\.templatePreviewImage\.onerror = null;\s*markTemplateImageBroken\(selectedTemplate, els\.templatePreviewImage\);/s
  );
  assert.match(
    designerSource,
    /previewImage\.addEventListener\("error", \(\) => \{\s*markTemplateImageBroken\(template, previewImage\);\s*\}, \{ once: true \}\);/s
  );
  assert.match(
    designerSource,
    /launch\.image = templateDesignImage\(template\) \|\| product\.image \|\| "";/s
  );
});
