// 把多行模板字符串折叠成单行, 用于拼接错误信息.
export default function format(string: string): string {
	return string.replace(/\n\s+/gm, " ");
}
