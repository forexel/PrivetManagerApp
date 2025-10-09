export default function ErrorPage() {
  return (
    <div style={{ padding: 16 }}>
      <h2>Что-то пошло не так</h2>
      <p>Попробуйте перезагрузить страницу или зайти позже.</p>
      <button onClick={() => location.reload()}>Обновить</button>
    </div>
  )
}

