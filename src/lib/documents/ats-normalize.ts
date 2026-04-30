export function normalizeTextForAts(html: string) {
  const replacements: Record<string, number> = {};
  const masks: string[] = [];
  const masked = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    const token = `\u0000MASK${masks.length}\u0000`;
    masks.push(match);
    return token;
  });

  let output = "";
  let index = 0;

  while (index < masked.length) {
    const tagStart = masked.indexOf("<", index);
    if (tagStart === -1) {
      output += sanitizeText(masked.slice(index), replacements);
      break;
    }

    output += sanitizeText(masked.slice(index, tagStart), replacements);
    const tagEnd = masked.indexOf(">", tagStart);
    if (tagEnd === -1) {
      output += masked.slice(tagStart);
      break;
    }

    output += masked.slice(tagStart, tagEnd + 1);
    index = tagEnd + 1;
  }

  return {
    html: output.replace(/\u0000MASK(\d+)\u0000/g, (_, number) => masks[Number(number)]),
    replacements
  };
}

function sanitizeText(text: string, replacements: Record<string, number>) {
  const bump = (key: string) => {
    replacements[key] = (replacements[key] ?? 0) + 1;
  };

  return text
    .replace(/\u2014/g, () => {
      bump("em-dash");
      return "-";
    })
    .replace(/\u2013/g, () => {
      bump("en-dash");
      return "-";
    })
    .replace(/[\u201C\u201D\u201E\u201F]/g, () => {
      bump("smart-double-quote");
      return '"';
    })
    .replace(/[\u2018\u2019\u201A\u201B]/g, () => {
      bump("smart-single-quote");
      return "'";
    })
    .replace(/\u2026/g, () => {
      bump("ellipsis");
      return "...";
    })
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, () => {
      bump("zero-width");
      return "";
    })
    .replace(/\u00A0/g, () => {
      bump("nbsp");
      return " ";
    })
    .replace(/\u25CF/g, () => {
      bump("bullet-circle");
      return "";
    })
    .replace(/\u2022/g, () => {
      bump("bullet-dot");
      return "|";
    });
}
