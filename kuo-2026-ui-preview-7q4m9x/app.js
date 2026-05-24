const STORAGE_KEY = "kuo-chat-sessions-v1";
const STORAGE_VERSION = 2;
const TITLE_LIMIT = 10;

const moreBtn = document.getElementById("more-btn");
const closeBtn = document.getElementById("close-drawer-btn");
const backdrop = document.getElementById("drawer-backdrop");
const drawer = document.getElementById("side-drawer");
const chat = document.getElementById("chat");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message-input");
const newChatBtn = document.getElementById("new-chat-btn");
const historyList = document.getElementById("history-list");
const historySearch = document.getElementById("history-search");
const uploadOpenBtn = document.getElementById("upload-open-btn");
const uploadBackdrop = document.getElementById("upload-backdrop");
const uploadPanel = document.getElementById("upload-panel");
const uploadCloseBtn = document.getElementById("upload-close-btn");
const imageUploadBtn = document.getElementById("image-upload-btn");
const audioUploadBtn = document.getElementById("audio-upload-btn");
const imageFileInput = document.getElementById("image-file-input");
const audioFileInput = document.getElementById("audio-file-input");
const deleteModeBtn = document.getElementById("delete-mode-btn");
const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const devSeedBtn = document.getElementById("dev-seed-btn");

let sessions = loadSessions();
let currentSessionId = Date.now();
let activeSession = createSession();
let deleteMode = false;
let isComposingMessage = false;
const selectedDeleteIds = new Set();

if (new URLSearchParams(window.location.search).has("dev")) {
  document.body.classList.add("dev-mode");
}

function createSession() {
  return {
    id: String(currentSessionId),
    title: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };
}

function normalizeMessage(message) {
  return {
    role: message.role === "bot" ? "bot" : "user",
    text: typeof message.text === "string" ? message.text : "",
    thinking: Boolean(message.thinking),
    attachments: Array.isArray(message.attachments) ? message.attachments : []
  };
}

function normalizeSession(session) {
  const messages = Array.isArray(session.messages) ? session.messages.map(normalizeMessage) : [];
  const firstUserMessage = messages.find((message) => message.role === "user");
  const fallbackTitle = firstUserMessage ? truncateTitle(firstUserMessage.text) : "";

  return {
    id: String(session.id || Date.now()),
    title: truncateTitle(session.title || fallbackTitle || "새 대화"),
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
    messages
  };
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed.sessions) ? parsed.sessions : [];
    return source.map(normalizeSession);
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      updatedAt: new Date().toISOString(),
      sessions
    })
  );
}

function truncateTitle(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > TITLE_LIMIT ? `${normalized.slice(0, TITLE_LIMIT)}...` : normalized;
}

function formatHistoryTime(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function syncActiveSession() {
  if (!activeSession.messages.length) {
    return;
  }

  activeSession.updatedAt = new Date().toISOString();
  const snapshot = {
    ...activeSession,
    messages: activeSession.messages.map((message) => ({ ...message }))
  };
  const existingIndex = sessions.findIndex((session) => session.id === activeSession.id);

  if (existingIndex >= 0) {
    sessions[existingIndex] = snapshot;
  } else {
    sessions.unshift(snapshot);
  }

  saveSessions();
}

function getFilteredSessions() {
  const query = historySearch.value.trim().toLowerCase();
  if (!query) {
    return sessions;
  }

  return sessions.filter((session) => {
    const titleMatch = session.title.toLowerCase().includes(query);
    const messageMatch = session.messages.some((message) => {
      const attachmentText = (message.attachments || []).map((attachment) => attachment.name).join(" ");
      return `${message.text} ${attachmentText}`.toLowerCase().includes(query);
    });
    return titleMatch || messageMatch;
  });
}

function renderHistoryList() {
  historyList.replaceChildren();
  confirmDeleteBtn.disabled = selectedDeleteIds.size === 0;

  const visibleSessions = getFilteredSessions();
  if (!visibleSessions.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = historySearch.value.trim() ? "검색 결과가 없습니다." : "저장된 대화가 없습니다.";
    historyList.appendChild(empty);
    return;
  }

  visibleSessions.forEach((session) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const checkbox = document.createElement("input");
    checkbox.className = "history-check";
    checkbox.type = "checkbox";
    checkbox.checked = selectedDeleteIds.has(session.id);
    checkbox.setAttribute("aria-label", `${session.title || "새 대화"} 선택`);
    checkbox.addEventListener("change", () => {
      toggleDeleteSelection(session.id, checkbox.checked);
    });

    const item = document.createElement("button");
    item.className = "history-item";
    item.type = "button";
    item.dataset.sessionId = session.id;

    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = session.title || "새 대화";

    const time = document.createElement("span");
    time.className = "history-time";
    time.textContent = formatHistoryTime(session.updatedAt);

    const edit = document.createElement("button");
    edit.className = "history-edit";
    edit.type = "button";
    edit.setAttribute("aria-label", `${session.title || "새 대화"} 제목 수정`);
    edit.textContent = "✎";

    item.appendChild(title);
    item.appendChild(time);
    item.addEventListener("click", () => {
      if (deleteMode) {
        checkbox.checked = !checkbox.checked;
        toggleDeleteSelection(session.id, checkbox.checked);
        return;
      }

      loadSession(session.id);
    });
    edit.addEventListener("click", () => renameSession(session.id));

    row.appendChild(checkbox);
    row.appendChild(item);
    row.appendChild(edit);
    historyList.appendChild(row);
  });
}

function renameSession(sessionId) {
  if (deleteMode) {
    return;
  }

  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }

  const nextTitle = window.prompt("대화 제목을 입력하세요. 10자 이후는 ...으로 표시됩니다.", session.title);
  if (nextTitle === null) {
    return;
  }

  const trimmed = nextTitle.trim();
  if (!trimmed) {
    return;
  }

  session.title = truncateTitle(trimmed);
  session.updatedAt = new Date().toISOString();
  if (activeSession.id === session.id) {
    activeSession.title = session.title;
  }
  saveSessions();
  renderHistoryList();
}

function enterDeleteMode() {
  deleteMode = true;
  selectedDeleteIds.clear();
  drawer.classList.add("delete-mode");
  renderHistoryList();
}

function exitDeleteMode() {
  deleteMode = false;
  selectedDeleteIds.clear();
  drawer.classList.remove("delete-mode");
  renderHistoryList();
}

function toggleDeleteSelection(sessionId, shouldSelect) {
  if (shouldSelect) {
    selectedDeleteIds.add(sessionId);
  } else {
    selectedDeleteIds.delete(sessionId);
  }

  confirmDeleteBtn.disabled = selectedDeleteIds.size === 0;
}

function deleteSelectedSessions() {
  if (!selectedDeleteIds.size) {
    return;
  }

  const deletingActiveSession = selectedDeleteIds.has(activeSession.id);
  sessions = sessions.filter((session) => !selectedDeleteIds.has(session.id));
  saveSessions();

  if (deletingActiveSession) {
    currentSessionId = Date.now();
    activeSession = createSession();
    chat.replaceChildren();
    chat.dataset.sessionId = String(currentSessionId);
    resetMessageInput();
  }

  exitDeleteMode();
}

function openDrawer() {
  closeUploadPanel();
  syncActiveSession();
  renderHistoryList();
  backdrop.classList.add("open");
  drawer.classList.add("open");
  moreBtn.setAttribute("aria-expanded", "true");
  trapFocus(drawer);
}

function closeDrawer() {
  backdrop.classList.remove("open");
  drawer.classList.remove("open");
  moreBtn.setAttribute("aria-expanded", "false");
  exitDeleteMode();
}

function openUploadPanel() {
  closeDrawer();
  uploadBackdrop.classList.add("open");
  uploadPanel.classList.add("open");
  uploadPanel.setAttribute("aria-hidden", "false");
  uploadOpenBtn.setAttribute("aria-expanded", "true");
  trapFocus(uploadPanel);
}

function closeUploadPanel() {
  uploadBackdrop.classList.remove("open");
  uploadPanel.classList.remove("open");
  uploadPanel.setAttribute("aria-hidden", "true");
  uploadOpenBtn.setAttribute("aria-expanded", "false");
}

function startNewSession() {
  syncActiveSession();
  renderHistoryList();
  currentSessionId = Date.now();
  activeSession = createSession();
  chat.replaceChildren();
  chat.dataset.sessionId = String(currentSessionId);
  closeDrawer();
  resetMessageInput();
}

function createMessageElement(message) {
  const isThinking = Boolean(message.thinking);
  const role = message.role === "bot" ? "bot" : "user";
  const section = document.createElement("section");
  section.className = `message ${role}${isThinking ? " thinking" : ""}`;
  section.setAttribute("aria-label", role === "user" ? "사용자 메시지" : isThinking ? "쿠오 생각 중" : "쿠오 메시지");

  if (role === "bot") {
    const avatar = document.createElement("img");
    avatar.className = "avatar small";
    avatar.src = "ui_reference/ku-o2.png";
    avatar.alt = "";
    section.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (isThinking) {
    bubble.setAttribute("aria-live", "polite");
    const dots = document.createElement("span");
    dots.className = "typing-dots";
    dots.setAttribute("aria-label", "...");
    dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";
    bubble.appendChild(dots);
  } else {
    if (message.text) {
      const paragraph = document.createElement("p");
      paragraph.textContent = message.text;
      bubble.appendChild(paragraph);
    }
    (message.attachments || []).forEach((attachment) => {
      bubble.appendChild(createAttachmentPreview(attachment));
    });
  }

  section.appendChild(bubble);
  return section;
}

function createAttachmentPreview(attachment) {
  const card = document.createElement("div");
  card.className = `attachment-card ${attachment.kind === "audio" ? "audio" : "image"}`;

  if (attachment.kind === "image") {
    const image = document.createElement("img");
    image.src = attachment.dataUrl;
    image.alt = attachment.name;
    card.appendChild(image);
  } else {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = attachment.dataUrl;
    card.appendChild(audio);
  }

  const name = document.createElement("span");
  name.className = "attachment-name";
  name.textContent = attachment.name;
  card.appendChild(name);
  return card;
}

function renderSessionMessages() {
  chat.replaceChildren();
  chat.dataset.sessionId = activeSession.id;

  activeSession.messages.forEach((message) => {
    chat.appendChild(createMessageElement(message));
  });

  chat.scrollTo({ top: chat.scrollHeight, behavior: "auto" });
}

function loadSession(sessionId) {
  syncActiveSession();
  const selected = sessions.find((session) => session.id === sessionId);
  if (!selected) {
    return;
  }

  activeSession = {
    ...selected,
    messages: selected.messages.map((message) => ({ ...message }))
  };
  currentSessionId = Number(activeSession.id) || Date.now();
  renderSessionMessages();
  closeDrawer();
  resetMessageInput();
}

function appendUserMessage(text, attachments = []) {
  const message = { role: "user", text, attachments };
  chat.appendChild(createMessageElement(message));
  activeSession.messages.push(message);
  if (!activeSession.title) {
    activeSession.title = truncateTitle(text || attachments[0]?.name || "파일 업로드");
  }
  chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
}

function showKuoThinking() {
  chat.querySelectorAll(".message.thinking").forEach((message) => message.remove());
  activeSession.messages = activeSession.messages.filter((message) => !message.thinking);

  const message = { role: "bot", text: "...", thinking: true };
  chat.appendChild(createMessageElement(message));
  activeSession.messages.push(message);
  chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleFileSelection(input, label, kind) {
  const files = Array.from(input.files || []);
  if (!files.length) {
    return;
  }

  const attachments = await Promise.all(
    files.map(async (file) => ({
      kind,
      name: file.name,
      type: file.type,
      dataUrl: await readFileAsDataUrl(file)
    }))
  );

  appendUserMessage(label, attachments);
  showKuoThinking();
  syncActiveSession();
  renderHistoryList();
  input.value = "";
  closeUploadPanel();
  resetMessageInput();
}

function resetMessageInput() {
  composer.reset();
  messageInput.value = "";
  messageInput.style.height = "";
  messageInput.setSelectionRange(0, 0);
  setTimeout(() => {
    messageInput.value = "";
    messageInput.style.height = "";
    messageInput.setSelectionRange(0, 0);
  }, 0);
  requestAnimationFrame(() => {
    messageInput.focus();
  });
}

function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 132)}px`;
}

function submitMessage() {
  if (isComposingMessage) {
    return;
  }

  const text = messageInput.value.trim();
  if (!text) {
    resetMessageInput();
    return;
  }

  appendUserMessage(text);
  showKuoThinking();
  syncActiveSession();
  renderHistoryList();
  resetMessageInput();
}

function trapFocus(container) {
  const focusable = container.querySelector("button, input, textarea, [tabindex]:not([tabindex='-1'])");
  if (focusable) {
    requestAnimationFrame(() => focusable.focus());
  }
}

function keepFocusInside(container, event) {
  const focusable = Array.from(
    container.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);

  if (!focusable.length) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function seedDemoData() {
  const now = new Date().toISOString();
  sessions = [
    {
      id: "seed-1",
      title: truncateTitle("학사규정 질문 길게 테스트"),
      createdAt: now,
      updatedAt: now,
      messages: [
        { role: "user", text: "학사규정 질문 길게 테스트합니다. 모바일 줄바꿈도 확인해주세요.", attachments: [] },
        { role: "bot", text: "...", thinking: true, attachments: [] }
      ]
    },
    {
      id: "seed-2",
      title: truncateTitle("이미지 업로드 테스트"),
      createdAt: now,
      updatedAt: now,
      messages: [
        { role: "user", text: "이미지 업로드", attachments: [] }
      ]
    }
  ];
  saveSessions();
  renderHistoryList();
}

moreBtn.addEventListener("click", openDrawer);
closeBtn.addEventListener("click", closeDrawer);
backdrop.addEventListener("click", closeDrawer);
uploadOpenBtn.addEventListener("click", openUploadPanel);
uploadCloseBtn.addEventListener("click", closeUploadPanel);
uploadBackdrop.addEventListener("click", closeUploadPanel);
imageUploadBtn.addEventListener("click", () => imageFileInput.click());
audioUploadBtn.addEventListener("click", () => audioFileInput.click());
deleteModeBtn.addEventListener("click", enterDeleteMode);
cancelDeleteBtn.addEventListener("click", exitDeleteMode);
confirmDeleteBtn.addEventListener("click", deleteSelectedSessions);
historySearch.addEventListener("input", renderHistoryList);
newChatBtn.addEventListener("click", startNewSession);
imageFileInput.addEventListener("change", () => handleFileSelection(imageFileInput, "이미지 업로드", "image"));
audioFileInput.addEventListener("change", () => handleFileSelection(audioFileInput, "음성 파일 업로드", "audio"));
messageInput.addEventListener("input", autoResizeInput);
messageInput.addEventListener("compositionstart", () => {
  isComposingMessage = true;
});
messageInput.addEventListener("compositionend", () => {
  isComposingMessage = false;
  autoResizeInput();
});
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    if (event.isComposing || isComposingMessage || event.keyCode === 229) {
      return;
    }

    event.preventDefault();
    submitMessage();
  }
});
composer.addEventListener("submit", (event) => {
  event.preventDefault();
  submitMessage();
});
devSeedBtn.addEventListener("click", seedDemoData);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeUploadPanel();
    closeDrawer();
    return;
  }

  if (event.key === "Tab") {
    if (uploadPanel.classList.contains("open")) {
      keepFocusInside(uploadPanel, event);
    } else if (drawer.classList.contains("open")) {
      keepFocusInside(drawer, event);
    }
  }
});

saveSessions();
renderHistoryList();
