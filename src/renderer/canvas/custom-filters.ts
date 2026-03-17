import { ColorMatrixFilter, Filter, GlProgram, UniformGroup } from 'pixi.js';

const defaultVertex = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

/**
 * Pixelate — real mosaic effect via GLSL.
 */
export class PixelateFilter extends Filter {
	constructor(size = 4) {
		const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uCells;

void main(void)
{
    vec2 pixelSize = vec2(1.0 / uCells);
    vec2 coord = floor(vTextureCoord / pixelSize) * pixelSize + pixelSize * 0.5;
    finalColor = texture(uTexture, coord);
}
`;
		const glProgram = GlProgram.from({ vertex: defaultVertex, fragment, name: 'pixelate-filter' });
		const uniforms = new UniformGroup({
			uCells: { value: Math.max(1, 200 / size), type: 'f32' },
		});
		super({ glProgram, resources: { pixelateUniforms: uniforms } });
	}

	set size(value: number) {
		this.resources.pixelateUniforms.uniforms.uCells = Math.max(1, 200 / value);
	}
}

/**
 * RGB Split — real chromatic aberration via spatial channel separation.
 */
export class RGBSplitFilter extends Filter {
	constructor(amount = 5) {
		const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uOffset;

void main(void)
{
    float r = texture(uTexture, vTextureCoord + vec2(uOffset, 0.0)).r;
    float g = texture(uTexture, vTextureCoord).g;
    float b = texture(uTexture, vTextureCoord - vec2(uOffset, 0.0)).b;
    float a = texture(uTexture, vTextureCoord).a;
    finalColor = vec4(r, g, b, a);
}
`;
		const glProgram = GlProgram.from({ vertex: defaultVertex, fragment, name: 'rgb-split-filter' });
		const uniforms = new UniformGroup({
			uOffset: { value: amount * 0.005, type: 'f32' },
		});
		super({ glProgram, resources: { rgbUniforms: uniforms } });
	}

	set amount(value: number) {
		this.resources.rgbUniforms.uniforms.uOffset = value * 0.005;
	}
}

/**
 * Distortion — barrel/pincushion lens distortion.
 */
export class DistortionFilter extends Filter {
	constructor(amount = 0.5) {
		const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uAmount;

void main(void)
{
    vec2 center = vec2(0.5);
    vec2 coord = vTextureCoord - center;
    float dist = length(coord);
    float distortion = 1.0 + dist * dist * uAmount;
    coord *= distortion;
    coord += center;
    if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {
        finalColor = vec4(0.0);
    } else {
        finalColor = texture(uTexture, coord);
    }
}
`;
		const glProgram = GlProgram.from({ vertex: defaultVertex, fragment, name: 'distortion-filter' });
		const uniforms = new UniformGroup({
			uAmount: { value: amount, type: 'f32' },
		});
		super({ glProgram, resources: { distortionUniforms: uniforms } });
	}

	set amount(value: number) {
		this.resources.distortionUniforms.uniforms.uAmount = value;
	}
}

/**
 * Glitch — scanline displacement + color channel offset + block shift.
 */
export class GlitchFilter extends Filter {
	constructor(amount = 0.5) {
		const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uAmount;
uniform float uTime;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void)
{
    vec2 coord = vTextureCoord;
    float amt = uAmount * 0.01;

    // Scanline block displacement
    float blockY = floor(coord.y * 20.0 + uTime * 5.0);
    float noise = rand(vec2(blockY, uTime));
    float shift = 0.0;
    if (noise > 1.0 - amt * 0.5) {
        shift = (rand(vec2(blockY + 1.0, uTime)) - 0.5) * amt * 2.0;
    }
    coord.x += shift;

    // RGB channel separation on glitched lines
    float chromatic = amt * 0.02;
    float r = texture(uTexture, coord + vec2(chromatic * (noise - 0.5), 0.0)).r;
    vec2 ga = texture(uTexture, coord).ga;
    float b = texture(uTexture, coord - vec2(chromatic * (noise - 0.3), 0.0)).b;

    finalColor = vec4(r, ga.x, b, ga.y);
}
`;
		const glProgram = GlProgram.from({ vertex: defaultVertex, fragment, name: 'glitch-filter' });
		const uniforms = new UniformGroup({
			uAmount: { value: amount, type: 'f32' },
			uTime: { value: 0, type: 'f32' },
		});
		super({ glProgram, resources: { glitchUniforms: uniforms } });
	}

	set amount(value: number) {
		this.resources.glitchUniforms.uniforms.uAmount = value;
	}

	update(): void {
		this.resources.glitchUniforms.uniforms.uTime = performance.now() * 0.001;
	}
}

/**
 * Vignette — real radial edge darkening.
 */
export class VignetteFilter extends Filter {
	constructor(amount = 0.5) {
		const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uAmount;

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    vec2 center = vec2(0.5);
    float dist = distance(vTextureCoord, center);
    float vig = smoothstep(0.8 - uAmount * 0.3, 0.2 + uAmount * 0.1, dist);
    color.rgb *= 1.0 - vig;
    finalColor = color;
}
`;
		const glProgram = GlProgram.from({ vertex: defaultVertex, fragment, name: 'vignette-filter' });
		const uniforms = new UniformGroup({
			uAmount: { value: amount, type: 'f32' },
		});
		super({ glProgram, resources: { vignetteUniforms: uniforms } });
	}

	set amount(value: number) {
		this.resources.vignetteUniforms.uniforms.uAmount = value;
	}
}

/**
 * Noise — random brightness + saturation + hue flicker per frame.
 */
export class NoiseColorFilter extends ColorMatrixFilter {
	private _amount = 0.5;

	constructor(amount = 0.5) {
		super();
		this._amount = amount;
		this.update();
	}

	set amount(value: number) {
		this._amount = value;
	}

	update(): void {
		this.reset();
		const bright = 1 + (Math.random() - 0.5) * this._amount * 2;
		this.brightness(bright, false);
		const sat = 1 + (Math.random() - 0.5) * this._amount * 3;
		this.saturate(sat, false);
		const hue = (Math.random() - 0.5) * this._amount * 30;
		this.hue(hue, false);
	}
}

/**
 * Wave/Ripple — GLSL displacement shader.
 */
export class WaveFilter extends Filter {
	constructor(amount = 10, time = 0) {
		const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uAmount;
uniform float uTime;

void main(void)
{
    vec2 coord = vTextureCoord;
    float amt = uAmount * 0.001;
    coord.x += sin(coord.y * 20.0 + uTime * 3.0) * amt;
    coord.y += cos(coord.x * 20.0 + uTime * 2.0) * amt;
    finalColor = texture(uTexture, coord);
}
`;
		const glProgram = GlProgram.from({
			vertex: defaultVertex,
			fragment,
			name: 'wave-filter',
		});

		const waveUniforms = new UniformGroup({
			uAmount: { value: amount, type: 'f32' },
			uTime: { value: time, type: 'f32' },
		});

		super({
			glProgram,
			resources: {
				waveUniforms,
			},
		});
	}

	set amount(value: number) {
		this.resources.waveUniforms.uniforms.uAmount = value;
	}

	update(): void {
		this.resources.waveUniforms.uniforms.uTime = performance.now() * 0.001;
	}
}
