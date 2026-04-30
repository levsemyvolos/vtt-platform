import { Layer } from 'react-konva';

/**
 * Reserved layer for ping markers (Ф3.4.1), free drawing (Ф3.4.2) and the
 * measurement tool (Ф3.4.3). These features need new `annotation:*` WSS
 * events that are not yet defined in `@vtt/shared` — added together with the
 * Initiative Tracker in Chat 7.1, or deferred to roadmap §3.10. Empty layer
 * is rendered now so layer ordering stays stable when annotations land.
 */
export default function AnnotationLayer(): JSX.Element {
  return <Layer listening={false} />;
}
