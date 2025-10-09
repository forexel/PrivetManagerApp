

# Run these from docs/:  make <target>

ROOT:=..
SERVER:=$(ROOT)/server

.PHONY: dump-schema openapi tree

## Dump PostgreSQL schema to docs/db_schema.sql (adjust PG vars if needed)
dump-schema:
	@echo "Exporting schema to db_schema.sql..."
	@PGPASSWORD=postgres pg_dump -h localhost -p 5432 -U postgres -d privetdb \
		--schema-only --no-owner --no-privileges > $(ROOT)/docs/db_schema.sql
	@echo "Done: docs/db_schema.sql"

## Export OpenAPI spec to docs/openapi.json (server must be running)
openapi:
	@curl -s http://127.0.0.1:8000/openapi.json -o $(ROOT)/docs/openapi.json && \
	echo "Saved to docs/openapi.json"

## Generate file tree snapshot to docs/FILE_TREE.md (macOS/Linux only)
tree:
	@echo "# File Tree (reference)" > $(ROOT)/docs/FILE_TREE.md
	@echo "" >> $(ROOT)/docs/FILE_TREE.md
	@echo '```' >> $(ROOT)/docs/FILE_TREE.md
	@cd $(ROOT) && \
		tree -I ".venv|__pycache__|node_modules|.git|.idea|.vscode|dist|build" >> docs/FILE_TREE.md
	@echo '```' >> $(ROOT)/docs/FILE_TREE.md
	@echo "Updated docs/FILE_TREE.md"