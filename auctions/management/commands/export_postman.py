import json
import os
import tempfile
import uuid

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Export an offline Postman Collection v2.1 JSON from the OpenAPI schema."""

    help = (
        'Generate docs/BidKori_v3.postman_collection.json from the '
        'drf-spectacular OpenAPI schema.'
    )

    OUTPUT_RELATIVE_PATH = os.path.join('docs', 'BidKori_v3.postman_collection.json')
    BASE_URL = 'http://127.0.0.1:8000'

    def handle(self, *args, **options):
        docs_dir = os.path.join(os.getcwd(), 'docs')
        os.makedirs(docs_dir, exist_ok=True)
        output_path = os.path.join(os.getcwd(), self.OUTPUT_RELATIVE_PATH)

        with tempfile.TemporaryDirectory() as tmp_dir:
            schema_path = os.path.join(tmp_dir, 'openapi-schema.json')
            call_command(
                'spectacular',
                '--format',
                'openapi-json',
                '--file',
                schema_path,
            )

            with open(schema_path, encoding='utf-8') as schema_file:
                openapi_schema = json.load(schema_file)

        collection = self._openapi_to_postman(openapi_schema)

        with open(output_path, 'w', encoding='utf-8') as output_file:
            json.dump(collection, output_file, indent=2)
            output_file.write('\n')

        self.stdout.write(
            '[OK] Offline Postman Collection exported to '
            'docs/BidKori_v3.postman_collection.json'
        )

    def _openapi_to_postman(self, openapi_schema):
        """Convert an OpenAPI 3 schema dict into Postman Collection v2.1."""
        info = openapi_schema.get('info', {})
        collection = {
            'info': {
                '_postman_id': str(uuid.uuid4()),
                'name': info.get('title', 'BidKori API'),
                'description': info.get('description', ''),
                'version': info.get('version', '3.0.0'),
                'schema': (
                    'https://schema.getpostman.com/json/collection/'
                    'v2.1.0/collection.json'
                ),
            },
            'variable': [
                {
                    'key': 'baseUrl',
                    'value': self.BASE_URL,
                    'type': 'string',
                },
                {
                    'key': 'token',
                    'value': '{{bearer_token}}',
                    'type': 'string',
                },
            ],
            'auth': {
                'type': 'apikey',
                'apikey': [
                    {'key': 'key', 'value': 'Authorization', 'type': 'string'},
                    {
                        'key': 'value',
                        'value': 'Token {{token}}',
                        'type': 'string',
                    },
                    {'key': 'in', 'value': 'header', 'type': 'string'},
                ],
            },
            'item': [],
        }

        folders = {}
        for path, path_item in openapi_schema.get('paths', {}).items():
            for method, operation in path_item.items():
                if method.startswith('x-') or method == 'parameters':
                    continue
                if not isinstance(operation, dict):
                    continue

                tags = operation.get('tags') or ['Default']
                folder_name = tags[0]
                folders.setdefault(folder_name, [])
                folders[folder_name].append(
                    self._build_request_item(path, method, operation)
                )

        for folder_name in sorted(folders.keys()):
            collection['item'].append(
                {
                    'name': folder_name,
                    'item': folders[folder_name],
                }
            )

        return collection

    def _build_request_item(self, path, method, operation):
        name = operation.get('summary') or operation.get('operationId') or f'{method.upper()} {path}'
        description = operation.get('description') or ''

        # Replace OpenAPI path params `{id}` with Postman `:id`.
        postman_path = path
        for param in operation.get('parameters', []):
            if param.get('in') == 'path':
                pname = param.get('name')
                postman_path = postman_path.replace(f'{{{pname}}}', f':{pname}')

        path_segments = [segment for segment in postman_path.strip('/').split('/') if segment]
        query = []
        for param in operation.get('parameters', []):
            if param.get('in') != 'query':
                continue
            query.append(
                {
                    'key': param.get('name'),
                    'value': '',
                    'description': param.get('description') or '',
                    'disabled': not param.get('required', False),
                }
            )

        request = {
            'method': method.upper(),
            'header': [
                {
                    'key': 'Accept',
                    'value': 'application/json',
                    'type': 'text',
                },
            ],
            'url': {
                'raw': '{{baseUrl}}' + (postman_path if postman_path.startswith('/') else f'/{postman_path}'),
                'host': ['{{baseUrl}}'],
                'path': path_segments,
            },
            'description': description,
        }

        if query:
            request['url']['query'] = query

        request_body = operation.get('requestBody', {})
        content = request_body.get('content', {})
        if 'multipart/form-data' in content:
            request['body'] = {
                'mode': 'formdata',
                'formdata': [
                    {
                        'key': 'images',
                        'type': 'file',
                        'src': [],
                        'description': 'Binary image upload field(s).',
                    }
                ],
            }
        elif 'application/json' in content:
            request['header'].append(
                {
                    'key': 'Content-Type',
                    'value': 'application/json',
                    'type': 'text',
                }
            )
            example = self._example_from_schema(
                content['application/json'].get('schema', {})
            )
            request['body'] = {
                'mode': 'raw',
                'raw': json.dumps(example, indent=2) if example is not None else '{}',
                'options': {'raw': {'language': 'json'}},
            }

        return {
            'name': name,
            'request': request,
            'response': [],
        }

    def _example_from_schema(self, schema, depth=0):
        """Build a simple JSON example from an OpenAPI schema fragment."""
        if depth > 4 or not isinstance(schema, dict):
            return None

        if '$ref' in schema:
            # Keep refs as placeholders; full resolution is unnecessary for export.
            return {'$ref': schema['$ref']}

        schema_type = schema.get('type')
        if 'example' in schema:
            return schema['example']
        if 'default' in schema:
            return schema['default']

        if schema_type == 'object' or 'properties' in schema:
            properties = schema.get('properties', {})
            return {
                key: self._example_from_schema(value, depth + 1)
                for key, value in properties.items()
            }

        if schema_type == 'array':
            item_example = self._example_from_schema(schema.get('items', {}), depth + 1)
            return [item_example] if item_example is not None else []

        if schema_type == 'integer':
            return 0
        if schema_type == 'number':
            return 0.0
        if schema_type == 'boolean':
            return False
        if schema_type == 'string':
            fmt = schema.get('format')
            if fmt == 'date-time':
                return '2026-01-01T00:00:00Z'
            if fmt == 'binary':
                return '<binary>'
            return 'string'

        if 'oneOf' in schema and schema['oneOf']:
            return self._example_from_schema(schema['oneOf'][0], depth + 1)
        if 'anyOf' in schema and schema['anyOf']:
            return self._example_from_schema(schema['anyOf'][0], depth + 1)

        return None
