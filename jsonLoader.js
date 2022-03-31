import fs from 'fs';

export default function jsonLoader(path) {
    return JSON.parse(
        fs.readFileSync(path, 'utf8')
    )
}
