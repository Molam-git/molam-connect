// Cette fonction rend le template en remplaçant les placeholders par les variables
// Exemple: "Hello {{user_name}}" avec { user_name: "John" } -> "Hello John"
export function renderTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] !== undefined ? String(variables[key]) : match;
    });
}