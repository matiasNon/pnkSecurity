<?php
require __DIR__ . '/setup/setup.php';
iniciar_sesion();

// El enlace desde la carta envía "keyid"; se acepta también "id". Sólo enteros válidos.
$key = entero_get('keyid') ?? entero_get('id');
$datos_restorant = null;
if ($key !== null) {
  $datos_restorant = consultar(
    "SELECT direcciones.calle, direcciones.numero, direcciones.comuna, direcciones.region, restautantes.nombre, restautantes.id, restautantes.fono, restautantes.email, restautantes.foto FROM restautantes INNER JOIN direcciones ON restautantes.direcciones_id = direcciones.id WHERE restautantes.id = ? AND restautantes.eliminado IS NULL",
    'i',
    [$key]
  )[0] ?? null;
}
if ($datos_restorant === null) {
  responder_error(404, 'Restaurante no encontrado');
}
$carrito = (isset($_SESSION['carrito']) && is_array($_SESSION['carrito'])) ? $_SESSION['carrito'] : [];

?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <meta name="csrf-token" content="<?php echo e(csrf_token());?>">
  <meta name="restaurante-id" content="<?php echo (int)$key;?>">
  <title><?php echo e($datos_restorant['nombre']);?></title>
	<!--<link rel="icon" href="img/Fevicon.png" type="image/png">-->

  <link rel="stylesheet" href="vendors/bootstrap/bootstrap.min.css" integrity="sha384-xOolHFLEh07PJGoPkLv1IbcEPTNtaed2xpHsD9ESMhqIYd0nLMwNLD69Npy4HI+N">
  <link rel="stylesheet" href="vendors/themify-icons/themify-icons.css" integrity="sha384-WvewGOCiLQQeyX74sRin+1vJVwXiQljXEll4oRenlaV/JugxUgA+KejVo+KeVA/8">
  <link rel="stylesheet" href="vendors/owl-carousel/owl.theme.default.min.css" integrity="sha384-8/AzSKHReNfZT4HGFTyRyJ1jXhhx/ZMnmX08Cy6TeaKWj0Vzho0AabG06C8mh02i">
  <link rel="stylesheet" href="vendors/owl-carousel/owl.carousel.min.css" integrity="sha384-kcNNzf7wI8//ZkNUaDd5JwxLoFaBgkj9Z4O4NwtuX9Lkmsz0HoITOxJsGkYxDuyG">

  <link rel="stylesheet" href="css/style.css">
</head>
<body>
<section>
    <div class="container contendor">
      <div class="row">
        <div class="col-lg-4">
          <div class="centrado">
            <div class="media">
              <img class="logosintituciones" src="img/logo.png" width="170px" alt="">
            </div><br><br>
          </div>  
        </div>
        <div class="col-lg-4">
          <div class="centrado">
            
            <?php
              $foto_restorant = ruta_foto($key, $datos_restorant['foto']);
              if($foto_restorant !== null)
              {
                ?>
                  <img class="logosintituciones" src="<?php echo e($foto_restorant);?>" width="170px" alt="">
              <?php
              }else{
                ?>
                  <img class="logosintituciones" src="img/logo_empresa_comodin.png" width="170px" alt="">
                <?php
              }
              ?>
            
          </div>  
        </div>
        <div class="col-lg-4">
          <div class="carro">
            <div class="media float-right">
              <a class="volver" href="index.php?id=<?php echo (int)$key;?>">
              Volver a la Carta
              </a>&nbsp;&nbsp;
              <a class="limpiar" href="#">
              Eliminar Todo
              </a>
            </div>
          </div>  
        </div>
    </div>
  </section>
  <section>
    <div class="container contendor">
      <div class="row">
        <div class="col-lg-12">
         <h4 class="intro-title centrado">Productos Agregados para Solicitar</h4>
        </div>
      </div>
    </div>
  </section>
  <section>
    <div class="container contendor">
      <div class="row">
        <div class="col-lg-12">
               <table class="table table-hover table-lg">
                  <thead>
                     <tr>
                        <th scope="col">Código</th>
                        <th scope="col">Producto</th>
                        <th scope="col">Precios</th>
                        <th scope="col">Acción</th>
                     </tr>
                  </thead>
                  <tbody>
                     <?php
                     $total=0;
                     foreach ($carrito as $value)
                     {
                     ?>
                     <tr>
                        <th scope="row"><?php echo e($value["id"]);?></th>
                        <td><?php echo e($value["nombre"]);?></td>
                        <td><?php echo e(moneda_chilena($value["precio"]));?></td>
                        <td>
                          <a class="elim" id="<?php echo (int)$value["posicion"];?>" href="#">
                            <svg width="2em" height="2em" viewBox="0 0 16 16" class="bi bi-trash-fill text-danger" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                              <path fill-rule="evenodd" d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7z"/>
                            </svg>
                          </a>
                        </td>
                     </tr>
                     <?php
                        $total+=(int)$value["precio"];
                     }
                     ?>
                  </tbody>
                </table>
              <div>
                <hr><br>
                <h3 class="price-tag text-center">¡¡¡Si estas listo con tu pedido, llama al garzón para solicitarlo!!!</h3>
                <!--<h3 class="price-tag">Total : <?php echo moneda_chilena($total);?></h3>-->
              </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="container contendor"><br>
    <hr>
		<div class="container">
			<div class="footer-bottom row align-items-center text-center">
				<p class="footer-text m-0 col-md-12">
        Copyright 2020, Todos los Derechos reservados PNK, <br>
            Sitio desarrollado para la Explotación de Vulnerabilidades Web, Laboratorio de Programación Segura I<br><b>Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena</b></br></br>
            <br><br>
        </p>
			</div>
		</div>
	</footer>

  <script src="vendors/jquery/jquery-3.7.1.min.js" integrity="sha384-1H217gwSVyLSIfaLxHbE7dRb3v4mYCKbpQvzx0cegeju1MVsGrX5xXxAvs/HgeFs"></script>
  <script src="vendors/bootstrap/bootstrap.bundle.min.js" integrity="sha384-Fy6S3B9q64WdZWQUiU+q4/2Lc9npb8tCaSX9FK7E8HnRr0Jz8D6OP9dO5Vg3Q9ct"></script>
  <script src="vendors/owl-carousel/owl.carousel.min.js" integrity="sha384-l/y5WJTphApmSlx76Ev6k4G3zxu/+19CVvn9OTKI7gs4Yu5Hm8mjpdtdr5oyhnNo"></script>
  <script src="vendors/nice-select/jquery.nice-select.min.js" integrity="sha384-m59ELcUP6nH7EgbLpXNSk+MEGN3hqBjmLCs8ujOhOFx83BrYQfsHqqoVzxKRDNTq"></script>
  <script src="vendors/Magnific-Popup/jquery.magnific-popup.min.js" integrity="sha384-fexNtx3nPE3sjIQuGk8G2X8X/aSEBVMC58R839hkgsY/Xjhvkm7m2otGhwrdESWj"></script>
  <script src="js/main.js"></script>
  <script src="js/controladorajax.js"></script>
</body>
</html>