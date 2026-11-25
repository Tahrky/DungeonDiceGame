export function toGrayscale(color: number): number {
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;
    const gray = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
    return (gray << 16) | (gray << 8) | gray;
}

export function adjustColor(color: number, factor: number): number {
    const red = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
    const green = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
    const blue = Math.min(255, Math.round((color & 0xff) * factor));
    return (red << 16) | (green << 8) | blue;
}
