export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: "IMAGE" | "DOCUMENT" | "OTHER";
  generated: boolean;
  url: string;
};

export type ChatSource = { url: string; title: string };

export type UIMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  status: "COMPLETE" | "STREAMING" | "STOPPED" | "ERROR";
  error?: string | null;
  model?: string | null;
  createdAt: string;
  attachments: ChatAttachment[];
  metadata?: { sources?: ChatSource[]; searches?: string[]; kind?: string; prompt?: string; stopReason?: string } | null;
  thinking?: boolean;
  retryable?: boolean;
  /** Not persisted on the server (e.g. request rejected before it was saved). */
  ephemeral?: boolean;
};

export type ModelOption = {
  id: string;
  name: string;
  description: string;
  provider: string;
  available: boolean;
  reason: string | null;
  isDefault: boolean;
  vision: boolean;
  documents: boolean;
  webSearch: boolean;
};

export type Capabilities = {
  models: ModelOption[];
  preferredModel: string | null;
  webSearchByDefault: boolean;
  imageGeneration: { enabled: boolean; configured: boolean };
  maxUploadMb: number;
};
