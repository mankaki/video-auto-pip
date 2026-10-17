export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/*.log',
            '**/*.{png,jpg,jpeg,gif,webp,svg,ico,bmp,avif}'
        ]
    },
    {
        files: ['**/*.js', '**/*.mjs', '**/*.user.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script'
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-redeclare': 'error',
            'no-dupe-keys': 'error'
        }
    },
    {
        files: ['**/*.user.js'],
        languageOptions: {
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                requestAnimationFrame: 'readonly',
                queueMicrotask: 'readonly',
                MutationObserver: 'readonly',
                ResizeObserver: 'readonly',
                HTMLVideoElement: 'readonly',
                Element: 'readonly',
                Node: 'readonly',
                Event: 'readonly'
            }
        }
    },
    {
        files: ['eslint.config.mjs'],
        languageOptions: {
            sourceType: 'module'
        }
    },
    {
        files: ['tests/*.cjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                __dirname: 'readonly',
                console: 'readonly',
                queueMicrotask: 'readonly'
            }
        }
    }
];
