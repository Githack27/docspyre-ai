export interface EditorState {
  content: string;
  isDirty: boolean;
  selectionStart: number;
  selectionEnd: number;
}

export function insertText(state: EditorState, textToInsert: string): EditorState {
  const { content, selectionStart, selectionEnd } = state;
  const newContent =
    content.slice(0, selectionStart) +
    textToInsert +
    content.slice(selectionEnd);
  const newCursorPos = selectionStart + textToInsert.length;

  return {
    content: newContent,
    isDirty: true,
    selectionStart: newCursorPos,
    selectionEnd: newCursorPos,
  };
}

export function clearEditorState(): EditorState {
  return {
    content: '',
    isDirty: false,
    selectionStart: 0,
    selectionEnd: 0,
  };
}
