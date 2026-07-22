export function firstVisibleIndexFromScroll(
    scrollTop: number,
    paddingTop: number,
    rowHeight: number,
    trackCount: number
): number {
    if (trackCount <= 0 || rowHeight <= 0) {
        return 0
    }
    const y = Math.max(0, scrollTop - paddingTop)
    return Math.min(trackCount - 1, Math.floor(y / rowHeight))
}
