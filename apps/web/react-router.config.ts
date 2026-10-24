import type { Config } from "@react-router/dev/config";

export default {
  // Static SPA: all data comes from the API worker via clientLoader/clientAction.
  ssr: false,
} satisfies Config;
