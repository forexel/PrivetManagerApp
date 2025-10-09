

# ERD

```mermaid
erDiagram
    users {
        uuid id PK
        varchar phone
        varchar email
        varchar password_hash
        varchar name
        varchar status
        bool has_subscription
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    devices {
        uuid id PK
        uuid user_id FK
        varchar title
        varchar brand
        varchar model
        varchar serial_number
        date purchase_date
        date warranty_until
        timestamptz created_at
        timestamptz updated_at
    }

    tickets {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        varchar title
        text description
        date preferred_date
        ticket_status status  // new, in_progress, completed, rejected
        timestamptz created_at
        timestamptz updated_at
    }

    users ||--o{ devices : owns
    users ||--o{ tickets : creates
    devices ||--o{ tickets : relates_to
```