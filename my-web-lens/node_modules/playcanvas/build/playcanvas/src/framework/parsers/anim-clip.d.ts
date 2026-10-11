/**
 * Parser for animation clip resources. Fetches the JSON data and builds an {@link AnimTrack}.
 *
 * @ignore
 */
export class AnimClipParser {
    canParse(): boolean;
    load(url: any, callback: any, asset: any): void;
    open(url: any, data: any): AnimTrack;
}
import { AnimTrack } from '../anim/evaluator/anim-track.js';
