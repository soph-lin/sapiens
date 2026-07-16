import type {
  DOMConversionMap,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  SerializedElementNode,
} from "lexical";
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $setDirectionFromDOM,
  $setFormatFromDOM,
  ElementNode,
} from "lexical";

export type SerializedCalloutNode = SerializedElementNode;

export class CalloutNode extends ElementNode {
  static getType(): string {
    return "callout";
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    const className = config.theme.callout;
    if (className) element.className = className;
    element.dataset.noteBlock = "callout";
    element.setAttribute("role", "note");
    return element;
  }

  updateDOM(): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (!(node instanceof HTMLElement) || node.dataset.noteBlock !== "callout") {
          return null;
        }

        return {
          conversion: convertCalloutElement,
          priority: 3,
        };
      },
    };
  }

  exportDOM(editor: LexicalEditor) {
    const { element } = super.exportDOM(editor);
    if (element instanceof HTMLElement && this.isEmpty()) {
      element.append(document.createElement("br"));
    }
    return { element };
  }

  static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
    return $createCalloutNode().updateFromJSON(serializedNode);
  }

  insertNewAfter(
    selection: RangeSelection,
    restoreSelection = true,
  ): LexicalNode {
    const newBlock = $createParagraphNode();
    newBlock.setTextFormat(selection.format);
    newBlock.setTextStyle(selection.style);
    newBlock.setDirection(this.getDirection());
    this.insertAfter(newBlock, restoreSelection);
    return newBlock;
  }

  collapseAtStart(): true {
    const paragraph = $createParagraphNode();
    const children = this.getChildren();
    children.forEach((child) => paragraph.append(child));
    this.replace(paragraph);
    return true;
  }

  canMergeWhenEmpty(): true {
    return true;
  }
}

function convertCalloutElement(element: HTMLElement) {
  const node = $createCalloutNode();
  $setFormatFromDOM(node, element);
  $setDirectionFromDOM(node, element);
  return { node };
}

export function $createCalloutNode(): CalloutNode {
  return $applyNodeReplacement(new CalloutNode());
}

export function $isCalloutNode(
  node: LexicalNode | null | undefined,
): node is CalloutNode {
  return node instanceof CalloutNode;
}
