// const hourSelectDropdowns = document.querySelectorAll('.time-select-h');
// const minuteSelectDropdowns = document.querySelectorAll('.time-select-m');

// hourSelectDropdowns.forEach(el => {
//   el.innerHTML = renderSelectRange(24);
  

//   if (el && el.dataset.reset === "0800"){
//     el.value = '08';
//   }else if (el && el.dataset.reset === "1200") {
//     el.value = '12';
//   }
// });

// minuteSelectDropdowns.forEach(el => {
//   el.innerHTML = renderSelectRange(60);
// });


// function renderSelectRange(max) {
//   return Array.from({ length: max }, (_, i) => {
//     const val = String(i).padStart(2, '0');
//     return `<option value="${val}">${val}</option>`;
//   }).join('');
// }
