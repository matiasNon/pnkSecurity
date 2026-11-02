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

function urlCarrito()
{
  // El restaurante viaja en la URL (carrito por restaurante); el servidor lo valida contra la BD.
  var rid = $('meta[name="restaurante-id"]').attr('content');
  return esEntero(rid) ? '/restaurantes/' + rid + '/carrito' : null;
}

function agregaritems(id)
{
  var base = urlCarrito();
  if (!esEntero(id) || base === null) { return; }
  $.ajax({
    type: "POST",
    url: base + '/items',
    data: { iditems: id },
    success: function()
    {
      $('#myModal').modal('show');
    }
  });
}

function eliminaritems(pos)
{
  var base = urlCarrito();
  if (!esEntero(pos) || base === null) { return; }
  $.ajax({
    type: "DELETE",
    url: base + '/items/' + pos,
    success: function()
    {
      location.reload();
    }
  });
}

function eliminartodo()
{
  var base = urlCarrito();
  if (base === null) { return; }
  $.ajax({
    type: "DELETE",
    url: base,
    success: function()
    {
      location.reload();
    }
  });
}
