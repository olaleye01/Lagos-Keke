/**
 * Parser for PlayCanvas JSON {@link Animation} resources. Acts as the catch-all (non-glb) animation
 * parser.
 *
 * @ignore
 */
export class JsonAnimationParser {
    canParse(): boolean;
    load(url: any, callback: any, asset: any): void;
    _parseAnimationV3(data: any): Animation;
    _parseAnimationV4(data: any): Animation;
}
import { Animation } from '../../scene/animation/animation.js';
