// JavaScript Document

// El token CSRF lo entrega el servidor en <meta name="csrf-token">; se envía en cada petición.
$.ajaxSetup({
  headers: { 'X-CSRF-Token': $('meta[name="csrf-token"]').attr('content') || '' }
});

$(document).ready(function(){
   $('.button').click(function(){
     agregaritems($(this).attr('id'));
   });

   $('.elim').click(function(){
      eliminaritems($(this).attr('id'));
    });
    $('.limpiar').click(function(){
      eliminartodo();
    });
 });

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
	$.ajax({
            type: "POST",
            url: 'carrito.php',
            data: "op=2&pos="+pos,
            success: function(response)
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
            data: "op=3",
            success: function(response)
            {
				location.reload();
            }
       });
}