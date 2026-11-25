export interface HeapEntry {
    readonly index: number;
    readonly distance: number;
}

export function pushHeap(heap: HeapEntry[], entry: HeapEntry): void {
    let index = heap.length;
    heap.push(entry);
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (heap[parent]!.distance <= entry.distance) break;
        heap[index] = heap[parent]!;
        index = parent;
    }
    heap[index] = entry;
}

export function popHeap(heap: HeapEntry[]): HeapEntry | undefined {
    const first = heap[0];
    const last = heap.pop();
    if (!first || !last || heap.length === 0) return first;

    let index = 0;
    while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]!.distance < heap[child]!.distance) {
            child++;
        }
        if (heap[child]!.distance >= last.distance) break;
        heap[index] = heap[child]!;
        index = child;
    }
    heap[index] = last;
    return first;
}
