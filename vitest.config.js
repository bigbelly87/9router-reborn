const path = require("path");

module.exports = {
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "open-sse": path.resolve(__dirname, "./open-sse"),
    },
  },
};
