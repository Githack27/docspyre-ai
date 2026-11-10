import type { SummarizerStateType, NoteImage } from '../state';
import type { SummarizerRuntime } from '../runtime';
import { imageGeneratorTool } from '../tools/image-generator.tool';
import { logger } from '../../../../core/utils/logger';

const VISUAL_TAG_RE = /!\[visual:\s*([^\]]+)\]\(generate\)/gi;

export const visualsNode = (runtime: SummarizerRuntime) => {
  return async (state: SummarizerStateType): Promise<Partial<SummarizerStateType>> => {
    let content = state.markdownContent;
    const images: NoteImage[] = [];

    if (!state.includeImages) {
      // Remove visual placeholder tags cleanly if user disabled images
      content = content.replace(VISUAL_TAG_RE, '');
      return { markdownContent: content, images: [], status: 'finalizing' };
    }

    const matches: Array<{ fullMatch: string; prompt: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = VISUAL_TAG_RE.exec(content)) !== null) {
      if (match[1]) {
        matches.push({ fullMatch: match[0], prompt: match[1].trim() });
      }
    }

    if (!matches.length) {
      return { markdownContent: content, images: [], status: 'finalizing' };
    }

    runtime.emit({
      type: 'status',
      phase: 'illustrating',
      message: `Generating ${matches.length} AI concept diagrams and illustrations using model vision/imaging...`,
    });

    for (let i = 0; i < matches.length; i++) {
      const { fullMatch, prompt } = matches[i]!;
      try {
        runtime.emit({
          type: 'status',
          phase: 'illustrating',
          message: `Generating visual diagram ${i + 1} of ${matches.length}: "${prompt.slice(0, 45)}..."`,
        });

        const generated = await imageGeneratorTool.generate({
          prompt,
          caption: prompt,
          provider: runtime.provider,
        });

        if (generated) {
          const imageObj: NoteImage = {
            id: generated.id,
            prompt,
            url: generated.url,
            caption: generated.caption,
          };
          images.push(imageObj);

          // Replace placeholder with markdown image tag
          content = content.replace(fullMatch, `\n\n![${generated.caption}](${generated.url})\n\n`);

          runtime.emit({
            type: 'visual',
            image: imageObj,
          });
        } else {
          content = content.replace(fullMatch, '');
        }
      } catch (err) {
        logger.warn('Failed to generate image for prompt', {
          prompt,
          error: err instanceof Error ? err.message : String(err),
        });
        content = content.replace(fullMatch, '');
      }
    }

    runtime.emit({
      type: 'status',
      phase: 'illustrating',
      message: `Finished generating ${images.length} high-resolution visual diagrams.`,
    });

    return {
      markdownContent: content,
      images,
      status: 'finalizing',
    };
  };
};
