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

export function errResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  // isError:true per the MCP CallToolResult contract — lets clients
  // mechanically distinguish failures from success payloads.
  return { content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}
