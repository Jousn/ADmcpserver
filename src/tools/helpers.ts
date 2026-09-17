export function jsonResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errResult(message: string): { content: Array<{ type: "text"; text: string }> } {
  return jsonResult({ error: message });
}
