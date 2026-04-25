import { describe, expect, it } from "vitest";

import { analyzeSandboxHtml, injectSandboxCsp } from "@/lib/sandbox-html";

describe("sandbox-html", () => {
  it("会向 HTML 注入 CSP 元标签", () => {
    const html = injectSandboxCsp("<!DOCTYPE html><html><head></head><body>OK</body></html>");

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
  });

  it("会阻断外部脚本和主动网络能力", () => {
    const report = analyzeSandboxHtml(`
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.example.com/app.js"></script>
        </head>
        <body>
          <script>
            fetch("https://api.example.com/data");
            localStorage.getItem("token");
          </script>
        </body>
      </html>
    `);

    expect(report.blockedReasons.length).toBeGreaterThan(0);
    expect(report.blockedReasons.join(" ")).toContain("外部运行资源");
    expect(report.blockedReasons.join(" ")).toContain("主动网络请求");
    expect(report.blockedReasons.join(" ")).toContain("浏览器本地信息访问");
  });
});
