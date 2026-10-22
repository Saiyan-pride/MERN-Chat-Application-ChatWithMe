import { Box, Text } from "@chakra-ui/react";
import React from "react";

/**
 * Lightweight, zero-dependency Markdown parser for ChatWithMe messages.
 * Formats:
 * - **bold text** or __bold text__
 * - *italic text* or _italic text_
 * - ~~strikethrough text~~
 * - `inline code`
 * - ```code blocks```
 * - > blockquotes (single & multi-line with left accent border)
 * - * or - or • bullet lists
 * - 1. 2. numbered lists
 * - ###, ##, # headings
 * - --- horizontal divider
 */

const renderInline = (text) => {
  if (!text) return null;

  // Tokenize bold, strikethrough, inline code, italic
  const regex =
    /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  const parts = [];
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    const key = `inline-${lastIdx}-${token.slice(0, 5)}`;

    if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      parts.push(
        <strong key={key} style={{ fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      parts.push(
        <del
          key={key}
          style={{
            textDecoration: "line-through",
            opacity: 0.75,
          }}
        >
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <Box
          as="code"
          key={key}
          px={1.5}
          py={0.5}
          mx={0.5}
          borderRadius="sm"
          bg="blackAlpha.200"
          fontFamily="monospace"
          fontSize="0.9em"
        >
          {token.slice(1, -1)}
        </Box>
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      parts.push(
        <em key={key} style={{ fontStyle: "italic" }}>
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
};

function MarkdownMessage({ content }) {
  if (!content || typeof content !== "string") return null;

  // 1. Separate code blocks from normal text
  const rawBlocks = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      rawBlocks.push({
        type: "text",
        body: content.slice(lastIndex, match.index),
      });
    }
    rawBlocks.push({
      type: "code",
      lang: match[1] || "code",
      body: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    rawBlocks.push({
      type: "text",
      body: content.slice(lastIndex),
    });
  }

  return (
    <Box fontSize="sm" lineHeight="tall">
      {rawBlocks.map((block, bIdx) => {
        if (block.type === "code") {
          return (
            <Box
              as="pre"
              key={`code-${bIdx}`}
              my={2}
              p={3}
              borderRadius="md"
              bg="gray.900"
              color="green.300"
              fontSize="xs"
              overflowX="auto"
              fontFamily="monospace"
              whiteSpace="pre"
            >
              <code>{block.body}</code>
            </Box>
          );
        }

        // 2. Group consecutive blockquotes and parse lines
        const lines = block.body.split(/\r?\n/);
        const lineGroups = [];
        let currentQuote = null;

        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (trimmed.startsWith(">")) {
            const quoteContent = trimmed.replace(/^>\s*/, "");
            if (!currentQuote) {
              currentQuote = [];
            }
            currentQuote.push(quoteContent);
          } else {
            if (currentQuote) {
              lineGroups.push({ type: "quote", lines: currentQuote });
              currentQuote = null;
            }
            lineGroups.push({ type: "line", raw: lines[i] });
          }
        }
        if (currentQuote) {
          lineGroups.push({ type: "quote", lines: currentQuote });
        }

        return (
          <Box key={`block-${bIdx}`}>
            {lineGroups.map((group, gIdx) => {
              // A. Render Blockquote group
              if (group.type === "quote") {
                return (
                  <Box
                    key={`quote-${gIdx}`}
                    pl={3}
                    py={1.5}
                    my={2}
                    borderLeftWidth="3.5px"
                    borderLeftColor="purple.400"
                    bg="blackAlpha.50"
                    borderRadius="sm"
                    fontStyle="italic"
                    color="gray.700"
                  >
                    {group.lines.map((qLine, qIdx) => (
                      <Text key={`q-${qIdx}`} my={0.5}>
                        {renderInline(qLine)}
                      </Text>
                    ))}
                  </Box>
                );
              }

              // B. Render standard line
              const line = group.raw;
              const trimmed = line.trim();

              if (!trimmed) {
                return <Box key={`space-${gIdx}`} h="6px" />;
              }

              // Horizontal Divider
              if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
                return (
                  <Box
                    as="hr"
                    key={`hr-${gIdx}`}
                    my={2}
                    borderColor="blackAlpha.300"
                  />
                );
              }

              // Headings: ###, ##, #
              if (trimmed.startsWith("### ")) {
                return (
                  <Text
                    key={`h3-${gIdx}`}
                    fontWeight="bold"
                    fontSize="sm"
                    mt={2}
                    mb={0.5}
                  >
                    {renderInline(trimmed.slice(4))}
                  </Text>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <Text
                    key={`h2-${gIdx}`}
                    fontWeight="bold"
                    fontSize="md"
                    mt={2.5}
                    mb={0.5}
                  >
                    {renderInline(trimmed.slice(3))}
                  </Text>
                );
              }
              if (trimmed.startsWith("# ")) {
                return (
                  <Text
                    key={`h1-${gIdx}`}
                    fontWeight="bold"
                    fontSize="lg"
                    mt={3}
                    mb={0.5}
                  >
                    {renderInline(trimmed.slice(2))}
                  </Text>
                );
              }

              // Bullet points: * or - or •
              const isBullet =
                trimmed.startsWith("* ") ||
                trimmed.startsWith("- ") ||
                trimmed.startsWith("• ");
              if (isBullet) {
                const bulletText = trimmed.replace(/^([*\-•]\s*)/, "");
                return (
                  <Box
                    key={`bullet-${gIdx}`}
                    display="flex"
                    alignItems="flex-start"
                    pl={1}
                    my={0.5}
                  >
                    <Box
                      w="4px"
                      h="4px"
                      mt="7px"
                      mr="6px"
                      borderRadius="full"
                      bg="currentColor"
                      flexShrink={0}
                    />
                    <Box flex={1}>{renderInline(bulletText)}</Box>
                  </Box>
                );
              }

              // Numbered points: e.g. 1. 2. 10.
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
              if (numMatch) {
                return (
                  <Box
                    key={`num-${gIdx}`}
                    display="flex"
                    alignItems="flex-start"
                    pl={1}
                    my={0.5}
                  >
                    <Text fontWeight="semibold" mr={1.5} flexShrink={0}>
                      {numMatch[1]}.
                    </Text>
                    <Box flex={1}>{renderInline(numMatch[2])}</Box>
                  </Box>
                );
              }

              // Standard line
              return (
                <Text key={`line-${gIdx}`} my={0.5}>
                  {renderInline(line)}
                </Text>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

export default MarkdownMessage;
