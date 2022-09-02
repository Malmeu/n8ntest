export type ExtensionMethodHandler<K> = (
	value: string,
	args: Array<number | string | boolean> | undefined,
) => K | Date;

// export interface ExpressionExtender<T> {
// 	hasMethod: (methodName: string) => boolean;
// 	listMethods: () => string[];
// 	methods: () => {
// 		[k: string]: ExtensionMethodHandler<T>;
// 	};
// 	methodMapping: Map<string, ExtensionMethodHandler<T>>;
// }

export abstract class BaseExtension<T> {
	methodMapping: Map<string, ExtensionMethodHandler<T>>;

	constructor() {
		this.methodMapping = new Map<string, ExtensionMethodHandler<T>>();
	}

	hasMethod(methodName: string): boolean {
		return this.methodMapping.has(methodName);
	}

	listMethods(): string[] {
		return Array.from(this.methodMapping.keys());
	}

	methods() {
		return Object.fromEntries(this.methodMapping.entries());
	}
}