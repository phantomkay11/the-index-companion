import { SketchMap, type MapProps } from '@/components/sketch-map';

/** On the web, the plotted sketch map stands in for native maps. */
export function FarmMap(props: MapProps) {
  return <SketchMap {...props} />;
}
