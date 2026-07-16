type SizingMode = "FILL" | "HUG";

type ApplyMessage = {
  type: "apply";
  mode: SizingMode;
  recursive: boolean;
};

type UiMessage = ApplyMessage | { type: "ready" };

figma.showUI(__html__, {
  width: 260,
  height: 280,
  themeColors: true,
});

function canSetSizing(node: SceneNode): node is SceneNode & {
  layoutSizingHorizontal: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical: "FIXED" | "HUG" | "FILL";
} {
  return "layoutSizingHorizontal" in node && "layoutSizingVertical" in node;
}

function parentIsAutoLayout(node: SceneNode): boolean {
  const parent = node.parent;
  return (
    parent !== null &&
    "layoutMode" in parent &&
    parent.layoutMode !== "NONE"
  );
}

function nodeSupportsHug(node: SceneNode): boolean {
  if (node.type === "TEXT") return true;
  if ("layoutMode" in node && node.layoutMode !== "NONE") return true;
  return false;
}

function isAbsolutelyPositioned(node: SceneNode): boolean {
  return "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE";
}

function applySizing(
  node: SceneNode,
  mode: SizingMode,
  counters: { changed: number; skipped: number }
): void {
  if (!canSetSizing(node)) {
    counters.skipped++;
    return;
  }

  if (isAbsolutelyPositioned(node) || !parentIsAutoLayout(node)) {
    counters.skipped++;
    return;
  }

  if (mode === "HUG" && !nodeSupportsHug(node)) {
    counters.skipped++;
    return;
  }

  try {
    let didChange = false;
    if (node.layoutSizingHorizontal !== mode) {
      node.layoutSizingHorizontal = mode;
      counters.changed++;
      didChange = true;
    }
    if (node.layoutSizingVertical !== mode) {
      node.layoutSizingVertical = mode;
      counters.changed++;
      didChange = true;
    }
    if (!didChange) counters.skipped++;
  } catch {
    counters.skipped++;
  }
}

function processChildren(
  parent: BaseNode & ChildrenMixin,
  mode: SizingMode,
  deep: boolean,
  counters: { changed: number; skipped: number }
): void {
  for (const child of parent.children) {
    applySizing(child, mode, counters);
    if (deep && "children" in child) {
      processChildren(child, mode, true, counters);
    }
  }
}

function applyToSelection(mode: SizingMode, recursive: boolean): void {
  const selection = figma.currentPage.selection;
  const counters = { changed: 0, skipped: 0 };

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: "result",
      changed: 0,
      message: "Select a frame first",
    });
    return;
  }

  for (const node of selection) {
    if ("children" in node) {
      processChildren(node, mode, recursive, counters);
    } else {
      counters.skipped++;
    }
  }

  const label = mode === "FILL" ? "Fill" : "Hug";
  const scope = recursive ? "descendants" : "children";
  const message =
    `Set ${counters.changed} axis${counters.changed === 1 ? "" : "es"} to ${label} on ${scope}` +
    (counters.skipped > 0 ? ` (${counters.skipped} skipped)` : "");

  figma.notify(message);
  figma.ui.postMessage({
    type: "result",
    changed: counters.changed,
    message,
  });
}

function postSelection(): void {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: "selection",
    count: selection.length,
    name: selection[0] ? selection[0].name : "",
  });
}

figma.on("selectionchange", postSelection);

figma.ui.onmessage = (msg: UiMessage) => {
  if (msg.type === "ready") {
    postSelection();
    return;
  }
  if (msg.type === "apply") {
    applyToSelection(msg.mode, msg.recursive);
  }
};
