import test from "node:test";
import assert from "node:assert/strict";
import { validateImageUrl, countImages, convertImagesToText } from "../src/lib/gateway/vision.js";

test("validates supported inline image data URLs and rejects unsafe sources", () => {
  const image = validateImageUrl("data:image/png;base64,aGVsbG8=");
  assert.equal(image.mediaType, "image/png");
  assert.equal(image.data, "aGVsbG8=");
  assert.equal(image.bytes, 5);
  assert.throws(() => validateImageUrl("https://example.com/image.png"), /inline PNG/);
  assert.throws(() => validateImageUrl("data:text/plain;base64,aGVsbG8="), /inline PNG/);
  assert.throws(() => validateImageUrl("data:image/png;base64,   "), /between 1 byte/);
});

test("counts images and converts them through the configured describer", async () => {
  const messages = [
    { role: "system", content: "describe" },
    { role: "user", content: [{ type: "text", text: "What is this?" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,aGk=" } }] },
  ];
  assert.equal(countImages(messages), 1);
  const seen = [];
  const transformed = await convertImagesToText(messages, async (image) => { seen.push(image.mediaType); return "a small test image"; });
  assert.deepEqual(seen, ["image/jpeg"]);
  assert.match(transformed[1].content[1].text, /small test image/);
  assert.equal(transformed[0], messages[0]);
  assert.deepEqual(await convertImagesToText([{ role: "user", content: "plain" }], async () => "unused"), [{ role: "user", content: "plain" }]);
});

test("rejects more than four images and invalid image parts", async () => {
  const many = [{ role: "user", content: Array.from({ length: 5 }, () => ({ type: "image_url", image_url: { url: "data:image/gif;base64,aA==" } })) }];
  await assert.rejects(() => convertImagesToText(many, async () => "x"), /At most 4 images/);
  await assert.rejects(() => convertImagesToText([{ content: [{ type: "image_url", image_url: { url: "https://example.com/x" } }] }], async () => "x"), /inline PNG/);
});
