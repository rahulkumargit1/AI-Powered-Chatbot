const state = {
  conversations: [],
  activeId: null,
  activeConvo: null,
  streaming: false,
};

const $ = (id) => document.getElementById(id);

const el = {
  list: $("conversation-list"),
  messages: $("messages"),
  title: $("chat-title"),
  newChat: $("new-chat-btn"),
  composer: $("composer"),
  input: $("composer-input"),
  send: $("send-btn"),
  errorBanner: $("error-banner"),
  settingsBtn: $("settings-btn"),
  modal: $("settings-modal"),
  systemPrompt: $("system-prompt-input"),
  cancelSettings: $("settings-cancel"),
  saveSettings: $("settings-save"),
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

function showError(msg) {
  el.errorBanner.textContent = msg;
  el.errorBanner.classList.remove("hidden");
}

function clearError() {
  el.errorBanner.classList.add("hidden");
}

async function loadConversations() {
  try {
    state.conversations = await api("/api/conversations");
    renderList();
  } catch (e) {
    showError(`Failed to load conversations: ${e.message}`);
  }
}

function renderList() {
  el.list.innerHTML = "";
  if (state.conversations.length === 0) {
    const empty = document.createElement("li");
    empty.style.color = "var(--muted)";
    empty.style.cursor = "default";
    empty.style.justifyContent = "center";
    empty.innerHTML = '<span class="convo-title">No chats yet</span>';
    el.list.appendChild(empty);
    return;
  }
  for (const c of state.conversations) {
    const li = document.createElement("li");
    if (c.id === state.activeId) li.classList.add("active");
    li.dataset.id = c.id;

    const titleSpan = document.createElement("span");
    titleSpan.className = "convo-title";
    titleSpan.textContent = c.title;
    li.appendChild(titleSpan);

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.title = "Delete";
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteConversation(c.id);
    });
    li.appendChild(del);

    li.addEventListener("click", () => selectConversation(c.id));
    el.list.appendChild(li);
  }
}

async function selectConversation(id) {
  if (state.streaming) return;
  state.activeId = id;
  try {
    state.activeConvo = await api(`/api/conversations/${id}`);
    el.title.textContent = state.activeConvo.title;
    el.input.disabled = false;
    el.send.disabled = false;
    el.input.focus();
    renderMessages();
    renderList();
    clearError();
  } catch (e) {
    showError(`Failed to load conversation: ${e.message}`);
  }
}

function renderMessages() {
  el.messages.innerHTML = "";
  if (!state.activeConvo) return;
  if (state.activeConvo.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h3>Start the conversation</h3><p>Type a message below.</p>";
    el.messages.appendChild(empty);
    return;
  }
  for (const m of state.activeConvo.messages) {
    appendMessage(m.role, m.content);
  }
  scrollToBottom();
}

function appendMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;
  el.messages.appendChild(div);
  return div;
}

function scrollToBottom() {
  el.messages.scrollTop = el.messages.scrollHeight;
}

async function createConversation() {
  try {
    const convo = await api("/api/conversations", { method: "POST", body: "{}" });
    state.conversations.unshift({
      id: convo.id,
      title: convo.title,
      updated_at: convo.updated_at,
    });
    state.activeId = convo.id;
    state.activeConvo = convo;
    el.title.textContent = convo.title;
    el.input.disabled = false;
    el.send.disabled = false;
    el.input.focus();
    renderList();
    renderMessages();
    clearError();
  } catch (e) {
    showError(`Failed to create chat: ${e.message}`);
  }
}

async function deleteConversation(id) {
  if (state.streaming) return;
  if (!confirm("Delete this conversation?")) return;
  try {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    state.conversations = state.conversations.filter((c) => c.id !== id);
    if (state.activeId === id) {
      state.activeId = null;
      state.activeConvo = null;
      el.title.textContent = "Select or start a conversation";
      el.input.disabled = true;
      el.send.disabled = true;
      el.messages.innerHTML = "";
    }
    renderList();
  } catch (e) {
    showError(`Delete failed: ${e.message}`);
  }
}

async function sendMessage(text) {
  if (!state.activeId || state.streaming) return;
  state.streaming = true;
  el.input.disabled = true;
  el.send.disabled = true;
  clearError();

  // Remove empty-state if present
  const emptyState = el.messages.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  appendMessage("user", text);
  scrollToBottom();
  const assistantBubble = appendMessage("assistant", "");
  assistantBubble.classList.add("streaming");
  scrollToBottom();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: state.activeId, message: text }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        handleSSEBlock(block, assistantBubble);
      }
    }
  } catch (e) {
    showError(`Stream error: ${e.message}`);
    assistantBubble.textContent += `\n\n[Error: ${e.message}]`;
  } finally {
    assistantBubble.classList.remove("streaming");
    state.streaming = false;
    el.input.disabled = false;
    el.send.disabled = false;
    el.input.focus();
  }
}

function handleSSEBlock(block, bubble) {
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }
  if (event === "error") {
    showError(parsed.message || "Unknown error");
    return;
  }
  if (event === "title" && parsed.title) {
    const idx = state.conversations.findIndex((c) => c.id === state.activeId);
    if (idx !== -1) {
      state.conversations[idx].title = parsed.title;
      el.title.textContent = parsed.title;
      renderList();
    }
    return;
  }
  if (event === "done") return;
  if (parsed.text) {
    bubble.textContent += parsed.text;
    scrollToBottom();
  }
}

// Composer events
el.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = el.input.value.trim();
  if (!text || state.streaming) return;
  el.input.value = "";
  el.input.style.height = "auto";
  sendMessage(text);
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    el.composer.requestSubmit();
  }
});

el.input.addEventListener("input", () => {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 200) + "px";
});

el.newChat.addEventListener("click", createConversation);

// Settings modal
el.settingsBtn.addEventListener("click", () => {
  if (!state.activeConvo) return;
  el.systemPrompt.value = state.activeConvo.system_prompt || "";
  el.modal.classList.remove("hidden");
});

el.cancelSettings.addEventListener("click", () => {
  el.modal.classList.add("hidden");
});

el.saveSettings.addEventListener("click", async () => {
  if (!state.activeId) return;
  const sp = el.systemPrompt.value;
  try {
    const updated = await api(`/api/conversations/${state.activeId}`, {
      method: "PATCH",
      body: JSON.stringify({ system_prompt: sp }),
    });
    state.activeConvo.system_prompt = updated.system_prompt;
    el.modal.classList.add("hidden");
  } catch (e) {
    showError(`Save failed: ${e.message}`);
  }
});

el.modal.addEventListener("click", (e) => {
  if (e.target === el.modal) el.modal.classList.add("hidden");
});

// Boot
loadConversations();
