// A vibe-coded app styles some things at runtime — the sandbox must reach those too.
document.querySelectorAll('.card').forEach((c) => { c.addEventListener('click', () => c.classList.toggle('card--on')) })
const lede = document.querySelector('.lede')
if (lede) lede.style.color = '#4f39f6'
const s = document.createElement('style')
s.textContent = '.card__value{color:#4338ca}'
document.head.appendChild(s)
