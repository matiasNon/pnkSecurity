// JavaScript Document

// El token CSRF lo entrega el servidor en <meta name="csrf-token">; se envía en cada petición.
$.ajaxSetup({
  headers: { 'X-CSRF-Token': $('meta[name="csrf-token"]').attr('content') || '' }
});

// Si la sesión o el token vencieron (403) se recarga la página para obtener uno nuevo; 409 = carrito lleno.
$(document).ajaxError(function(evento, xhr){
  if (xhr.status === 403) {
    location.reload();
  } else if (xhr.status === 409) {
    alert('El carrito alcanzó el máximo de productos.');
  }
});

$(document).ready(function(){
   $('.button').click(function(e){
     e.preventDefault();
     agregaritems($(this).attr('id'));
   });

   $('.elim').click(function(e){
      e.preventDefault();
      eliminaritems($(this).attr('id'));
    });
    $('.limpiar').click(function(e){
      e.preventDefault();
      eliminartodo();
    });
 });

function esEntero(valor)
{
  return /^[0-9]{1,10}$/.test(String(valor));
}

function agregaritems(id)
{
  if (!esEntero(id)) { return; }
  $.ajax({
    type: "POST",
    url: 'carrito.php',
    data: { op: 1, iditems: id, rid: $('meta[name="restaurante-id"]').attr('content') },
    success: function()
    {
      $('#myModal').modal('show');
    }
  });
}

function eliminaritems(pos)
{
  if (!esEntero(pos)) { return; }
  $.ajax({
    type: "POST",
    url: 'carrito.php',
    data: { op: 2, pos: pos },
    success: function()
    {
      location.reload();
    }
  });
}

function eliminartodo()
{
  $.ajax({
    type: "POST",
    url: 'carrito.php',
    data: { op: 3 },
    success: function()
    {
      location.reload();
    }
  });
}
