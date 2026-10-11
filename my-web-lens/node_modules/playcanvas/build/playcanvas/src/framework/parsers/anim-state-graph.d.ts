/**
 * Parser for animation state graph resources. Fetches the JSON data and builds an
 * {@link AnimStateGraph}.
 *
 * @ignore
 */
export class AnimStateGraphParser {
    canParse(): boolean;
    load(url: any, callback: any, asset: any): void;
    open(url: any, data: any): AnimStateGraph;
}
import { AnimStateGraph } from '../anim/state-graph/anim-state-graph.js';
