import { describe, expect, it } from "vitest";

import RootLayout, { viewport } from "@/app/layout";

describe("mobile document layout", () => {
  it("uses Simplified Chinese and full safe-area coverage without disabling zoom", () => {
    const tree = RootLayout({ children: <main /> });

    expect(tree.props.lang).toBe("zh-CN");
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
    });
    expect(viewport).not.toHaveProperty("maximumScale");
    expect(viewport).not.toHaveProperty("userScalable", false);
  });
});
